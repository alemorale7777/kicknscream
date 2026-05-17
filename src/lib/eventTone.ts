import type { EventType } from "@prisma/client";

/**
 * Visual tone per event type — used by calendar blocks, badges, and legends.
 * Stays inside the Pitch & Floodlight palette; each type gets a distinct hue
 * for at-a-glance recognition on the week grid.
 */
export const EVENT_TONE: Record<
  EventType,
  {
    label: string;
    bg: string;
    border: string;
    text: string;
    dot: string;
    accent: string; // raw color for inline styles (legends, programs)
  }
> = {
  LESSON: {
    label: "Lesson",
    bg: "bg-turf-400/15",
    border: "border-turf-400/50",
    text: "text-turf-200",
    dot: "bg-turf-400",
    accent: "#1FB663",
  },
  CLASS: {
    label: "Class",
    bg: "bg-flood-400/15",
    border: "border-flood-400/50",
    text: "text-flood-300",
    dot: "bg-flood-400",
    accent: "#E8FF3C",
  },
  PRACTICE: {
    label: "Practice",
    bg: "bg-sky-500/15",
    border: "border-sky-500/50",
    text: "text-sky-300",
    dot: "bg-sky-500",
    accent: "#0EA5E9",
  },
  GAME: {
    label: "Game",
    bg: "bg-danger/15",
    border: "border-danger/50",
    text: "text-red-300",
    dot: "bg-danger",
    accent: "#FF4D4D",
  },
  TRYOUT: {
    label: "Tryout",
    bg: "bg-purple-500/15",
    border: "border-purple-500/50",
    text: "text-purple-300",
    dot: "bg-purple-500",
    accent: "#A855F7",
  },
  CAMP: {
    label: "Camp",
    bg: "bg-warn/15",
    border: "border-warn/50",
    text: "text-orange-300",
    dot: "bg-warn",
    accent: "#FFB347",
  },
  CLINIC: {
    label: "Clinic",
    bg: "bg-fuchsia-500/15",
    border: "border-fuchsia-500/50",
    text: "text-fuchsia-300",
    dot: "bg-fuchsia-500",
    accent: "#D946EF",
  },
};

export const ALL_EVENT_TYPES = Object.keys(EVENT_TONE) as EventType[];
