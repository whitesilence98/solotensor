"use client";

import Link from "next/link";
import { ArrowRight, Cpu, Film, Sparkles, Wand2, Zap } from "lucide-react";
import Carousel from "@/components/Carousel";

export interface PromoSlide {
  id: string;
  title: string;
  badge: string;
  badgeType?: "accent" | "amber" | "cyan" | "violet";
  subtitle: string;
  ctaText: string;
  href: string;
  icon: typeof Wand2;
  gradient: string;
  borderHover: string;
  patternSvg?: string;
}

const PROMO_SLIDES: PromoSlide[] = [
  {
    id: "flux-3-klein",
    title: "FLUX 3 Image Klein",
    badge: "New Architecture",
    badgeType: "accent",
    subtitle: "Local sub-second photorealism & prompt-aligned typography conditioning.",
    ctaText: "Try Now",
    href: "/generate",
    icon: Wand2,
    gradient: "from-[var(--surface-raised)] via-[#151c14] to-[var(--surface-sunken)]",
    borderHover: "hover:border-[var(--accent)]/60",
  },
  {
    id: "forge-minimax-h3",
    title: "Forge MINIMAX H3 Video",
    badge: "Online Training",
    badgeType: "cyan",
    subtitle: "Generate cinematic 4K camera trajectories and dynamic human physics.",
    ctaText: "Explore Video",
    href: "/tools",
    icon: Film,
    gradient: "from-[var(--surface-raised)] via-[#101b24] to-[var(--surface-sunken)]",
    borderHover: "hover:border-cyan-500/60",
  },
  {
    id: "seedance-speed",
    title: "SEEDANCE High Speed",
    badge: "Price Drop / Fast",
    badgeType: "amber",
    subtitle: "Instant latent compilation with 2.8x accelerated generation speeds.",
    ctaText: "Boost Latency",
    href: "/generate",
    icon: Zap,
    gradient: "from-[var(--surface-raised)] via-[#221c10] to-[var(--surface-sunken)]",
    borderHover: "hover:border-amber-500/60",
  },
  {
    id: "lora-studio",
    title: "LoRA Training Studio",
    badge: "Custom Adapters",
    badgeType: "violet",
    subtitle: "Fine-tune character consistency, styles, and poses in high density.",
    ctaText: "Train LoRA",
    href: "/models",
    icon: Cpu,
    gradient: "from-[var(--surface-raised)] via-[#1e1526] to-[var(--surface-sunken)]",
    borderHover: "hover:border-violet-500/60",
  },
  {
    id: "comfy-pipelines",
    title: "ComfyUI Visual Nodes",
    badge: "Workflow Hub",
    badgeType: "accent",
    subtitle: "Turn multi-stage generation graphs into reproducible 1-click tools.",
    ctaText: "Browse Tools",
    href: "/tools",
    icon: Sparkles,
    gradient: "from-[var(--surface-raised)] via-[#141d18] to-[var(--surface-sunken)]",
    borderHover: "hover:border-[var(--accent)]/60",
  },
];

export default function HomePromoCarousel() {
  const getBadgeStyle = (type?: PromoSlide["badgeType"]) => {
    switch (type) {
      case "amber":
        return "border-amber-500/40 bg-amber-500/15 text-amber-300";
      case "cyan":
        return "border-cyan-500/40 bg-cyan-500/15 text-cyan-300";
      case "violet":
        return "border-violet-500/40 bg-violet-500/15 text-violet-300";
      case "accent":
      default:
        return "border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)]";
    }
  };

  return (
    <Carousel
      items={PROMO_SLIDES}
      itemsPerView={{ base: 1, sm: 2, lg: 3 }}
      gap={16}
      autoplay={true}
      autoplayInterval={5500}
      loop={true}
      ariaLabel="Promotional feature banners"
      renderItem={(slide) => {
        const Icon = slide.icon;
        return (
          <div
            className={`group relative flex h-full min-h-[170px] flex-col justify-between overflow-hidden rounded-2xl border border-[var(--line)] bg-gradient-to-br ${slide.gradient} p-5 transition-all duration-300 ${slide.borderHover} hover:shadow-[0_12px_36px_rgba(0,0,0,0.5)]`}
          >
            {/* Subtle technical background grid / glow */}
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/[0.03] blur-2xl group-hover:scale-125 transition-transform duration-500"
              aria-hidden="true"
            />

            {/* Top Bar: Badge + Icon */}
            <div className="relative z-10 flex items-start justify-between gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider backdrop-blur-md ${getBadgeStyle(
                  slide.badgeType
                )}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                {slide.badge}
              </span>

              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-[var(--ink-soft)] group-hover:text-[var(--accent)] group-hover:scale-110 transition-all">
                <Icon className="h-4 w-4" />
              </div>
            </div>

            {/* Middle: Title & Subtitle */}
            <div className="relative z-10 my-3">
              <h3 className="font-heading text-lg font-bold tracking-tight text-white group-hover:text-[var(--accent)] transition-colors">
                {slide.title}
              </h3>
              <p className="mt-1 line-clamp-2 text-xs font-normal leading-relaxed text-[var(--ink-soft)]">
                {slide.subtitle}
              </p>
            </div>

            {/* Bottom: Action CTA */}
            <div className="relative z-10 flex items-center justify-between pt-1 border-t border-white/[0.06]">
              <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--ink-faint)]">
                Local GPU Accelerated
              </span>
              <Link
                href={slide.href}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] active:scale-95 transition-all duration-200"
              >
                <span>{slide.ctaText}</span>
                <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>
        );
      }}
    />
  );
}
