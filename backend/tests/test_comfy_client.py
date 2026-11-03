"""Unit tests for ComfyClient CLIP + sampler/scheduler enum discovery (no live ComfyUI)."""

import unittest
from unittest.mock import MagicMock

import httpx

from app.services.comfy_client import (
    ComfyClient,
    ComfyClientError,
    ComfyValidationError,
)


class _FakeResponse:
    def __init__(self, payload=None, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = "" if status_code < 400 else "fake error body"

    async def aread(self):
        return b""

    def json(self):
        return self._payload


class _FakeHTTP:
    def __init__(self, client):
        self._client = client

    async def __aenter__(self):
        return self._client

    async def __aexit__(self, *exc_info):
        return False


class _FakeAsyncClient:
    """Mimics httpx.AsyncClient.get for /object_info/<class> only."""

    def __init__(self, mapping):
        self.mapping = mapping

    async def get(self, url):
        class_type = url.rsplit("/", 1)[-1]
        entry = self.mapping.get(class_type)
        if isinstance(entry, Exception):
            raise entry
        if entry is None:
            return _FakeResponse(status_code=500)
        return _FakeResponse({class_type: {"input": {"required": {"type": [entry]}}}})


class _FakeComfyClient(ComfyClient):
    def __init__(self, mapping):
        super().__init__(settings=MagicMock())
        self.mapping = mapping

    def _http(self):
        return _FakeHTTP(_FakeAsyncClient(self.mapping))


class ClipTypesTests(unittest.IsolatedAsyncioTestCase):
    async def test_clip_types_unions_both_loaders_clip_loader_first(self):
        client = _FakeComfyClient(
            {"CLIPLoader": ["krea2", "ltxv"], "DualCLIPLoader": ["ltxv", "wan2"]}
        )
        self.assertEqual(await client.clip_types(), ["krea2", "ltxv", "wan2"])

    async def test_resolve_clip_type_accepts_video_only_protocol(self):
        client = _FakeComfyClient(
            {"CLIPLoader": ["krea2"], "DualCLIPLoader": ["ltxv"]}
        )
        self.assertEqual(await client.resolve_clip_type("ltxv"), "ltxv")

    async def test_one_endpoint_failure_still_returns_the_other(self):
        client = _FakeComfyClient(
            {"CLIPLoader": ["krea2"], "DualCLIPLoader": httpx.ConnectError("down")}
        )
        self.assertEqual(await client.clip_types(), ["krea2"])

    async def test_both_endpoints_failing_raises(self):
        client = _FakeComfyClient(
            {
                "CLIPLoader": httpx.ConnectError("down"),
                "DualCLIPLoader": httpx.ReadTimeout("slow"),
            }
        )
        with self.assertRaises(ComfyClientError):
            await client.clip_types()


# --------------------------------------------------------------------------- #
# Sampler/scheduler enum discovery.
#
# Two disjoint vocabularies coexist in one ComfyUI build: the flat 63-key set
# (KSampler / KSamplerAdvanced / KSamplerSelect: ``euler``, ``dpmpp_2m`` …) and
# the Clownshar ``family/name`` set (ClownsharKSampler_Beta: ``linear/euler``
# …). A value resolved against the wrong class is rejected by ComfyUI and the
# whole graph is discarded, so resolution is always per class.
# --------------------------------------------------------------------------- #

FLAT_SAMPLERS = [
    "euler",
    "euler_ancestral",
    "dpm_2",
    "dpmpp_2m",
    "ddim",
    "heun",
    "dpmpp_sde",
    "lcm",
]

CLOWNSHAR_SAMPLERS = [
    "linear/euler",
    "linear/midpoint_2s",
    "multistep/dpmpp_2m",
    "exponential/ddim",
    "exponential/ddim_beta57",
]

SCHEDULERS = [
    "simple",
    "sgm_uniform",
    "karras",
    "exponential",
    "ddim_uniform",
    "beta",
    "normal",
    "linear_quadratic",
    "beta57",
    "kl_optimal",
    "flow",
    "flow_sde",
]

# Legacy nodes emit a bare-list spec: ``[[...], {"tooltip": ...}]``.
# V3-schema nodes emit ``["COMBO", {"options": [...]}]``.
SAMPLER_SPECS = {
    "KSampler": {"sampler_name": [FLAT_SAMPLERS, {"tooltip": "flat"}]},
    "KSamplerAdvanced": {"sampler_name": [FLAT_SAMPLERS, {"tooltip": "flat"}]},
    "KSamplerSelect": {
        "sampler_name": ["COMBO", {"multiselect": False, "options": FLAT_SAMPLERS}]
    },
    "ClownsharKSampler_Beta": {
        "sampler_name": ["COMBO", {"multiselect": False, "options": CLOWNSHAR_SAMPLERS}]
    },
}


class _EnumFakeHTTP:
    def __init__(self, client):
        self._client = client

    async def __aenter__(self):
        return self._client

    async def __aexit__(self, *exc_info):
        return False


class _EnumFakeAsyncClient:
    """Mimics httpx.AsyncClient.get for /object_info/<class>; counts requests."""

    def __init__(self, mapping, calls):
        self.mapping = mapping
        self.calls = calls

    async def get(self, url):
        class_type = url.rsplit("/", 1)[-1]
        self.calls.append(class_type)
        entry = self.mapping.get(class_type)
        if isinstance(entry, Exception):
            raise entry
        if entry is None:
            return _FakeResponse(status_code=500)
        return _FakeResponse({class_type: {"input": {"required": entry}}})


class _EnumFakeComfyClient(ComfyClient):
    def __init__(self, mapping):
        settings = MagicMock()
        settings.comfy_http = "http://fake-comfy:8188"
        super().__init__(settings=settings)
        self.mapping = mapping
        self.calls: list[str] = []

    def _http(self):
        return _EnumFakeHTTP(_EnumFakeAsyncClient(self.mapping, self.calls))


class ComboOptionsTests(unittest.TestCase):
    def test_parses_bare_list_spec(self):
        options = [f"sampler_{i}" for i in range(63)]
        spec = [options, {"tooltip": "Sampler"}]
        self.assertEqual(ComfyClient._combo_options(spec), options)
        self.assertEqual(len(ComfyClient._combo_options(spec)), 63)

    def test_parses_combo_wrapper_spec(self):
        spec = ["COMBO", {"multiselect": False, "options": ["linear/euler", "exponential/ddim"]}]
        self.assertEqual(
            ComfyClient._combo_options(spec), ["linear/euler", "exponential/ddim"]
        )

    def test_junk_specs_return_empty_list_without_raising(self):
        for spec in (None, [], ["COMBO"], {"options": ["euler"]}, "euler", 42):
            with self.subTest(spec=spec):
                self.assertEqual(ComfyClient._combo_options(spec), [])

    def test_non_string_and_empty_entries_are_dropped(self):
        spec = [["euler", "", None, 3], {"tooltip": ""}]
        self.assertEqual(ComfyClient._combo_options(spec), ["euler"])


class SamplerResolutionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        ComfyClient.clear_enum_cache()

    async def test_flat_key_aliases_into_the_clownshar_vocabulary(self):
        client = _EnumFakeComfyClient(SAMPLER_SPECS)
        resolved = await client.resolve_sampler(
            "euler", ["KSamplerAdvanced", "ClownsharKSampler_Beta"]
        )
        # The core behaviour: one request value, two vocabularies, one graph.
        self.assertEqual(
            resolved,
            {"KSamplerAdvanced": "euler", "ClownsharKSampler_Beta": "linear/euler"},
        )

    async def test_no_alias_key_raises_validation_error_naming_the_class(self):
        """``heun`` is flat-only: the alias map deliberately leaves it unmapped."""
        client = _EnumFakeComfyClient(SAMPLER_SPECS)
        with self.assertRaises(ComfyValidationError) as ctx:
            await client.resolve_sampler("heun", ["ClownsharKSampler_Beta"])
        message = str(ctx.exception)
        self.assertIn("ClownsharKSampler_Beta", message)
        self.assertIn("heun", message)

    async def test_flat_key_is_still_accepted_by_a_flat_class(self):
        """Same key, flat class: accepted verbatim — rejection is per class, not global."""
        client = _EnumFakeComfyClient(SAMPLER_SPECS)
        self.assertEqual(
            await client.resolve_sampler("heun", ["KSamplerSelect"]),
            {"KSamplerSelect": "heun"},
        )

    async def test_manufactured_civitai_pair_is_rejected(self):
        """The exact string from the reported crash: ``sampler_scheduler`` composite."""
        client = _EnumFakeComfyClient(SAMPLER_SPECS)
        with self.assertRaises(ComfyValidationError) as ctx:
            await client.resolve_sampler("exponential/ddim_beta57", ["KSamplerSelect"])
        self.assertIn("KSamplerSelect", str(ctx.exception))
        self.assertIn("exponential/ddim_beta57", str(ctx.exception))

    async def test_blank_and_non_string_values_short_circuit_without_http(self):
        client = _EnumFakeComfyClient(SAMPLER_SPECS)
        self.assertEqual(await client.resolve_sampler("", ["KSamplerSelect"]), {})
        self.assertEqual(await client.resolve_sampler("   ", ["KSamplerSelect"]), {})
        self.assertEqual(await client.resolve_sampler(None, ["KSamplerSelect"]), {})
        self.assertEqual(client.calls, [])

    async def test_value_valid_for_one_class_is_omitted_from_the_others(self):
        client = _EnumFakeComfyClient(SAMPLER_SPECS)
        resolved = await client.resolve_sampler(
            "euler", ["KSamplerSelect", "ClownsharKSampler_Beta"]
        )
        self.assertEqual(
            resolved,
            {"KSamplerSelect": "euler", "ClownsharKSampler_Beta": "linear/euler"},
        )

    async def test_flat_only_key_without_alias_writes_only_the_flat_class(self):
        """``dpmpp_sde`` has no verified Clownshar equivalent — never guessed."""
        client = _EnumFakeComfyClient(SAMPLER_SPECS)
        resolved = await client.resolve_sampler(
            "dpmpp_sde", ["KSamplerSelect", "ClownsharKSampler_Beta"]
        )
        self.assertEqual(resolved, {"KSamplerSelect": "dpmpp_sde"})
        self.assertNotIn("ClownsharKSampler_Beta", resolved)

    async def test_clownshar_key_aliases_back_to_flat(self):
        client = _EnumFakeComfyClient(SAMPLER_SPECS)
        resolved = await client.resolve_sampler(
            "multistep/dpmpp_2m", ["KSampler", "ClownsharKSampler_Beta"]
        )
        self.assertEqual(
            resolved,
            {"KSampler": "dpmpp_2m", "ClownsharKSampler_Beta": "multistep/dpmpp_2m"},
        )

    async def test_outage_raises_plain_client_error_not_validation_error(self):
        """An unreachable /object_info must become 502, never 422."""
        client = _EnumFakeComfyClient(
            {"KSamplerSelect": httpx.ConnectError("down")}
        )
        with self.assertRaises(ComfyClientError) as ctx:
            await client.resolve_sampler("euler", ["KSamplerSelect"])
        self.assertNotIsInstance(ctx.exception, ComfyValidationError)
        self.assertIn("KSamplerSelect", str(ctx.exception))

    async def test_enum_cache_serves_repeat_lookups_then_refetches_after_clear(self):
        client = _EnumFakeComfyClient(SAMPLER_SPECS)
        await client.resolve_sampler("euler", ["KSamplerSelect"])
        await client.resolve_sampler("dpm_2", ["KSamplerSelect"])
        self.assertEqual(client.calls, ["KSamplerSelect"])

        ComfyClient.clear_enum_cache()
        await client.resolve_sampler("euler", ["KSamplerSelect"])
        self.assertEqual(client.calls, ["KSamplerSelect", "KSamplerSelect"])

    async def test_empty_enum_is_not_cached(self):
        """A failed lookup must not pin the outage for the whole TTL."""
        client = _EnumFakeComfyClient({})
        with self.assertRaises(ComfyClientError):
            await client.resolve_sampler("euler", ["KSamplerSelect"])
        self.assertEqual(client.calls, ["KSamplerSelect"])

        client.mapping = dict(SAMPLER_SPECS)
        client.calls.clear()
        self.assertEqual(
            await client.resolve_sampler("euler", ["KSamplerSelect"]),
            {"KSamplerSelect": "euler"},
        )
        self.assertEqual(client.calls, ["KSamplerSelect"])

    async def test_scheduler_options_reads_the_scheduler_field_of_the_right_class(self):
        mapping = {
            "BasicScheduler": {"scheduler": ["COMBO", {"options": SCHEDULERS}], "steps": ["INT", {}]},
        }
        client = _EnumFakeComfyClient(mapping)
        self.assertEqual(await client.scheduler_options("BasicScheduler"), SCHEDULERS)
        self.assertEqual(len(SCHEDULERS), 12)

    async def test_scheduler_resolution_rejects_a_sampler_name(self):
        mapping = {"BasicScheduler": {"scheduler": ["COMBO", {"options": SCHEDULERS}]}}
        client = _EnumFakeComfyClient(mapping)
        with self.assertRaises(ComfyValidationError):
            await client.resolve_scheduler("euler", ["BasicScheduler"])


if __name__ == "__main__":
    unittest.main()
