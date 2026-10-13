"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SectionNav, type NavSection } from "@/components/guide/section-nav";
import { districtsFromHash } from "@/lib/ballot-link";
import { clearStoredDistricts, readStoredOrder, storeDistricts, storeOrder, storedDistrictsSnapshot, subscribeBallotStorage } from "@/lib/ballot-storage";
import { chooseShown, forgetLinkedBallot, linkedBallotSnapshot, subscribeLinkedBallot } from "@/lib/ballot-view";
import type { Districts } from "@/lib/districts";
import { formatIsoDate } from "@/lib/election";
import { ballotPlaces, byAttention, numbered, voterBallot, type BallotData } from "@/lib/my-ballot";
import { BallotLookup } from "./ballot-lookup";
import { ContestCard, OneNameStrip } from "./contest";
import { ShareBallot } from "./share-ballot";

/**
 * My Ballot, in the browser. The server hands over one list for every voter;
 * this picks one voter's contests out of it, from districts held in a shared
 * link, on this device, or in a signed-in account. The districts are never
 * asked of a server, so there is no request that could log them.
 */

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const LINK = `font-bold underline decoration-2 underline-offset-2 ${FOCUS}`;
const MYVOTE_BALLOT = "https://myvote.wi.gov/en-us/Whats-On-My-Ballot";

const noLink = () => "";
const noStored = () => "";
const defaultOrder = () => "attention" as const;

function MyVote({ children }: { children: React.ReactNode }) {
  return (
    <a href={MYVOTE_BALLOT} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
    </a>
  );
}

export function MyBallot({ data, children }: { data: BallotData; children: React.ReactNode }) {
  const knownCounties = useMemo(() => (data.counties ? new Set(Object.keys(data.counties)) : null), [data.counties]);
  const countyChoices = useMemo(
    () => Object.entries(data.counties ?? {}).map(([key, county]) => ({ key, name: county.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [data.counties],
  );

  const linkText = useSyncExternalStore(subscribeLinkedBallot, linkedBallotSnapshot, noLink);
  const storedText = useSyncExternalStore(subscribeBallotStorage, storedDistrictsSnapshot, noStored);
  const order = useSyncExternalStore(subscribeBallotStorage, readStoredOrder, defaultOrder);

  const { isAuthenticated } = useConvexAuth();
  const prefs = useQuery(api.preferences.getMine, {});
  const save = useMutation(api.preferences.saveDistricts);
  const accountText = prefs?.congressionalDistrict
    ? `cd=${prefs.congressionalDistrict}&sd=${prefs.stateSenateDistrict ?? ""}&ad=${prefs.stateAssemblyDistrict ?? ""}`
    : "";

  const shown = useMemo(
    () =>
      chooseShown({
        link: districtsFromHash(linkText, knownCounties),
        device: districtsFromHash(storedText, knownCounties),
        account: districtsFromHash(accountText, knownCounties),
      }),
    [linkText, storedText, accountText, knownCounties],
  );

  /** The visitor's own districts: kept on this device, and with their account when signed in. */
  const keepDistricts = (districts: Districts, matchedAddress?: string) => {
    storeDistricts(districts);
    // Someone else's districts must not stay in the address bar.
    window.history.replaceState(null, "", window.location.pathname);
    forgetLinkedBallot();
    if (isAuthenticated) {
      void save({
        address: matchedAddress ?? "",
        congressionalDistrict: String(districts.congressional),
        stateSenateDistrict: String(districts.senate),
        stateAssemblyDistrict: String(districts.assembly),
      });
    }
  };

  const ballot = useMemo(() => (shown.from === "none" ? null : voterBallot(data, shown.districts)), [data, shown]);
  const numbers = useMemo(() => numbered(ballot?.contests ?? []), [ballot]);
  const { decisions, oneName } = useMemo(() => byAttention(ballot?.contests ?? []), [ballot]);

  const sections: NavSection[] = useMemo(
    () =>
      order === "ballot"
        ? [
            { id: "contests", label: "Contests", count: ballot?.contests.length },
            { id: "questions", label: "Questions", count: 3 },
          ]
        : [
            ...(decisions.length > 0 ? [{ id: "decisions", label: "Decisions", count: decisions.length }] : []),
            ...(oneName.length > 0 ? [{ id: "one-name", label: "One name", count: oneName.length }] : []),
            { id: "questions", label: "Questions", count: 3 },
          ],
    [order, ballot, decisions.length, oneName.length],
  );

  const certified = data.ballotSource.url ? (
    <p className="mt-2 font-mono text-xs uppercase tracking-wide">
      Names and order from{" "}
      <a href={data.ballotSource.url} target="_blank" rel="noopener noreferrer" className={LINK}>
        the state’s certified list, dated {formatIsoDate(data.ballotSource.documentDate)}
      </a>
    </p>
  ) : null;

  if (shown.from === "none" || !ballot) {
    return (
      <div data-ballot-ready="none">
        <section id="lookup" className="mt-6 scroll-mt-16 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)] sm:p-6">
          <h2 className="font-display text-2xl">Enter your address to see your ballot.</h2>
          <div className="mt-4">
            <BallotLookup counties={countyChoices} onFound={keepDistricts} />
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-2xl">On every Wisconsin ballot</h2>
          <p className="mt-2 max-w-2xl">
            These statewide contests are on every ballot. Your U.S. House, State Senate, Assembly and county contests appear once you enter an address.
          </p>
          {certified}
          <div className="mt-4 space-y-5">
            {data.statewide.map((contest) => (
              <ContestCard key={contest.key} contest={contest} />
            ))}
          </div>
        </section>

        <section id="questions" className="mt-10 scroll-mt-16">
          <h2 className="font-display text-2xl">Questions</h2>
          {children}
        </section>
        <LocalAndSpanish />
      </div>
    );
  }

  const { districts } = shown;
  const places = ballotPlaces(districts, ballot.county);
  const orderToggle = (
    <button type="button" onClick={() => storeOrder(order === "ballot" ? "attention" : "ballot")} className={`min-h-11 shrink-0 ${LINK}`}>
      {order === "ballot" ? "Show decisions first" : "Show in ballot order"}
    </button>
  );

  return (
    <div data-ballot-ready={shown.from}>
      <section className="mt-4 border-2 border-border bg-secondary p-3 shadow-[var(--shadow-brutal)] sm:mt-6 sm:p-6">
        <h2 className="font-display flex flex-wrap gap-x-3 gap-y-1 text-lg leading-tight sm:gap-x-5 sm:text-3xl">
          {places.map((place, i) => (
            <span key={place} className="whitespace-nowrap">
              {place}
              {/* Read aloud as a list; drawn as separate phrases. */}
              {i < places.length - 1 && <span className="sr-only">, </span>}
            </span>
          ))}
        </h2>
        {certified}
        {shown.from === "link" && (
          <p className="mt-4 border-t-2 border-dashed border-border pt-4">
            Showing the ballot for these districts. Yours may differ.{" "}
            <a href="#lookup" className={LINK}>
              Enter my address
            </a>
          </p>
        )}
      </section>

      {ballot.county.status !== "ok" && (
        <section className="mt-5 border-2 border-border bg-card p-4">
          {ballot.county.status === "not-certified" ? (
            <p>
              County offices aren’t loaded yet. <MyVote>See your full ballot at MyVote</MyVote>.
            </p>
          ) : (
            <>
              <p className="font-bold">We couldn’t tell which county this is, so county offices aren’t shown.</p>
              <label className="mt-3 block text-sm font-bold">
                Your county
                <select
                  value=""
                  onChange={(event) => event.target.value && keepDistricts({ ...districts, county: event.target.value })}
                  className={`mt-1 block min-h-11 border-2 border-border bg-card px-3 py-2 ${FOCUS}`}
                >
                  <option value="" disabled>
                    Pick your county
                  </option>
                  {countyChoices.map((county) => (
                    <option key={county.key} value={county.key}>
                      {county.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-3 text-sm">
                Or <MyVote>see your full ballot at MyVote</MyVote>.
              </p>
            </>
          )}
        </section>
      )}

      <div className="mt-4">
        <SectionNav sections={sections} />
      </div>

      {order === "ballot" ? (
        <section id="contests" className="mt-6 scroll-mt-16">
          <h2 className="font-display text-2xl">Your ballot, in the state’s order</h2>
          <p className="mt-1">{orderToggle}</p>
          <div className="mt-3 space-y-5">
            {ballot.contests.map((contest) => (
              <ContestCard key={contest.key} contest={contest} number={numbers.get(contest.key)} />
            ))}
          </div>
        </section>
      ) : (
        <>
          {decisions.length > 0 && (
            <section id="decisions" className="mt-4 scroll-mt-16">
              <div className="flex flex-wrap items-center justify-between gap-x-4">
                <h2 className="font-display text-2xl">Your decisions</h2>
                {orderToggle}
              </div>
              <p className="sr-only">
                {decisions.length === 1 ? "One contest has" : `${decisions.length} contests have`} more than one name on the ballot.
              </p>
              <div className="mt-2 space-y-5">
                {decisions.map((contest) => (
                  <ContestCard key={contest.key} contest={contest} number={numbers.get(contest.key)} />
                ))}
              </div>
            </section>
          )}
          {oneName.length > 0 && (
            <section id="one-name" className="mt-10 scroll-mt-16">
              <h2 className="font-display text-2xl">One name on the ballot</h2>
              <p className="mt-2 max-w-2xl">
                {oneName.length === 1 ? "This office has" : `These ${oneName.length} offices have`} a single candidate on the ballot.
              </p>
              <div className="mt-4">
                <OneNameStrip contests={oneName} numbers={numbers} />
              </div>
            </section>
          )}
        </>
      )}

      {ballot.senate === "not-up" && (
        <p className="mt-6 max-w-2xl border-2 border-border bg-card p-4">
          {districts.senate % 2 === 0
            ? `State Senate District ${districts.senate} is not on the ballot in 2026. Even-numbered districts vote in 2028.`
            : `We don’t have a State Senate contest for District ${districts.senate}. `}
          {districts.senate % 2 !== 0 && <MyVote>Check your ballot at MyVote</MyVote>}
        </p>
      )}

      <section id="questions" className="mt-10 scroll-mt-16">
        <h2 className="font-display text-2xl">Questions</h2>
        {children}
      </section>

      <LocalAndSpanish />

      <section className="mt-10 border-t-2 border-border pt-6">
        <h2 className="font-display text-2xl">Share this ballot</h2>
        <ShareBallot districts={districts} />
      </section>

      <section id="lookup" className="mt-10 scroll-mt-16 border-t-2 border-border pt-6">
        <h2 className="font-display text-2xl">{shown.from === "link" ? "See your own ballot" : "Use a different address"}</h2>
        <div className="mt-4">
          <BallotLookup counties={countyChoices} onFound={keepDistricts} />
        </div>
        {shown.from === "device" && (
          <p className="mt-4 text-sm">
            Your districts are remembered on this device only.{" "}
            <button type="button" onClick={clearStoredDistricts} className={`min-h-11 ${LINK}`}>
              Forget them
            </button>
          </p>
        )}
      </section>
    </div>
  );
}

function LocalAndSpanish() {
  return (
    <div className="mt-10 max-w-2xl space-y-3 border-t-2 border-dashed border-border pt-6">
      <p>BadgerBrief does not tell you how to vote.</p>
      <p>
        Local questions, and a few local offices that cover part of a county, aren’t listed here. <MyVote>See your full ballot at MyVote Wisconsin</MyVote>, the state’s official
        site.
      </p>
      <p>
        <a href="/es/vote" lang="es" className={LINK}>
          Información para votar en español
        </a>
      </p>
    </div>
  );
}
