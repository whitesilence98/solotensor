/**
 * Lifetime predicate for an async page run.
 *
 * A run belongs to the viewer who started it and to a single attempt. A late
 * response (after an account switch, a newer run, or unmount) must be dropped
 * instead of writing progress/results into whatever session is now on screen.
 *
 * Deliberately one plain function: pages keep their own scope ref, so there is
 * no state machine to learn, and the stale-completion rule stays testable.
 */

export interface RunAttempt {
  viewerAtStart: string | null;
  attempt: number;
}

export interface RunScopeState {
  mounted: boolean;
  viewerId: string | null;
  latestAttempt: number;
}

/** True while the attempt is still the live one for this page and viewer. */
export function isAttemptCurrent(
  attempt: RunAttempt,
  scope: RunScopeState,
): boolean {
  return (
    scope.mounted &&
    scope.viewerId === attempt.viewerAtStart &&
    scope.latestAttempt === attempt.attempt
  );
}
