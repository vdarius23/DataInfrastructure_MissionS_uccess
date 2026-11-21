import { useEffect, useState } from "react";
import { fetchTripDetail } from "../api/client";
import { formatSigned, formatUtcTimestamp, metersPerSecondToKmh } from "../lib/format";
import type { TripDetail } from "../types";
import { AlertIcon } from "./Icons";

const KIND_LABEL = {
  harsh_braking: "Harsh braking",
  harsh_acceleration: "Harsh acceleration",
} as const;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; trip: TripDetail };

interface TripDetailPanelProps {
  sessionId: string;
  onClose: () => void;
}

export function TripDetailPanel({ sessionId, onClose }: TripDetailPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchTripDetail(sessionId)
      .then((trip) => {
        if (!cancelled) setState({ status: "ready", trip });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Could not load this trip.";
        if (!cancelled) setState({ status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <section aria-label={`Score explanation for trip ${sessionId}`} className="overflow-hidden rounded-xl border border-sky-400/20 bg-navy-900/80">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">
          Why this score?<span className="ml-2 font-mono text-xs font-normal text-slate-400">{sessionId}</span>
        </h2>
        <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
          Close
        </button>
      </div>
      <div className="p-4">
        {state.status === "loading" && <div className="h-24 animate-pulse rounded-md bg-white/[0.04]" />}
        {state.status === "error" && <p role="alert" className="flex items-center gap-2 text-sm text-rose-200"><AlertIcon className="h-4 w-4 shrink-0" />{state.message}</p>}
        {state.status === "ready" && <TripExplanation trip={state.trip} />}
      </div>
    </section>
  );
}

function TripExplanation({ trip }: { trip: TripDetail }) {
  const totalPenalty = trip.score_deductions.reduce((sum, deduction) => sum + deduction.points, 0);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-300">
        Score: <span className="font-mono">100</span>
        {trip.score_deductions.map((deduction) => (
          <span key={`${deduction.kind}-${deduction.at}`} className="font-mono text-rose-300"> {"− "}{deduction.points}</span>
        ))}{" = "}
        <span className="text-lg font-semibold tabular-nums text-white">{trip.smoothness_score}</span>
        {totalPenalty > 100 && <span className="text-slate-500"> (the score never goes below 0)</span>}
      </p>
      {trip.driving_events.length === 0 ? (
        <p className="text-sm text-teal-200">No harsh braking or harsh acceleration on this trip: full marks.</p>
      ) : (
        <ol className="space-y-2">
          {trip.driving_events.map((event, index) => (
            <li key={`${event.kind}-${event.start}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-white/5 bg-navy-950/60 px-3 py-2 text-sm">
              <span className={event.kind === "harsh_braking" ? "font-medium text-rose-200" : "font-medium text-amber-200"}>{KIND_LABEL[event.kind]}</span>
              <span className="tabular-nums text-slate-400">{formatUtcTimestamp(event.start)} UTC</span>
              <span className="tabular-nums text-slate-300">{metersPerSecondToKmh(event.speed_before_mps).toFixed(0)} → {metersPerSecondToKmh(event.speed_after_mps).toFixed(0)} km/h</span>
              <span className="tabular-nums text-slate-300">peak {formatSigned(event.peak_acceleration_mps2, 1)} m/s²</span>
              <span className="font-mono text-rose-300">−{trip.score_deductions[index]?.points ?? 0} pts</span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-slate-500">How it works: speed changing by 3 m/s² or more between two readings counts as harsh. Each trip starts at 100; harsh braking costs 10 points, harsh acceleration 5.</p>
    </div>
  );
}
