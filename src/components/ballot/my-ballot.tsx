"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import { PollingPlaceCard } from "./polling-place";
import type { PollingPlace } from "@/lib/districts";

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

export function MyBallot({
  data,
  questionCount,
  children,
}: {
  data: BallotData;
  /** How many statewide questions the page shows; absent when the questions file is not certified. */
  questionCount?: number;
  children: React.ReactNode;
}) {
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

  const own = useMemo(() => districtsFromHash(storedText, knownCounties), [storedText, knownCounties]);
  const shown = useMemo(
    () => chooseShown({ link: districtsFromHash(linkText, knownCounties), device: own, account: districtsFromHash(accountText, knownCounties) }),
    [linkText, own, accountText, knownCounties],
  );

  // After the ballot on show changes because of something the visitor did,
  // take them to it: to the top, with the districts read out. Without this a
  // lookup made at the foot of the page changes a ballot far above it, and a
  // screen reader hears nothing.
  const headline = useRef<HTMLHeadingElement>(null);
  const showNext = useRef(false);
  // The address form folds out at the top, right above the ballot it changes
  // (Tarik, 2026-10-15). /ballot#lookup (the brief's "Change address") opens it.
  const lookup = useRef<HTMLDetailsElement>(null);
  const openLookup = () => {
    if (!lookup.current) return;
    lookup.current.open = true;
    lookup.current.querySelector("input")?.focus();
  };

  useEffect(() => {
    if (!showNext.current) return;
    showNext.current = false;
    window.scrollTo(0, 0);
    headline.current?.focus({ preventScroll: true });
  }, [shown]);

  /** Stop showing a shared link, and take it out of the address bar (see ballot-view.ts for why that needs care). */
  const leaveLink = () => forgetLinkedBallot();

  const [countyPick, setCountyPick] = useState("");
  // From the visitor's own lookup only, and only for this visit: never part of a shared link.
  const [pollingPlace, setPollingPlace] = useState<PollingPlace | null>(null);

  /** The visitor's own districts: kept on this device, and with their account when signed in. */
  const keepDistricts = (districts: Districts, matchedAddress?: string, place?: PollingPlace) => {
    showNext.current = true;
    if (lookup.current) lookup.current.open = false;
    setPollingPlace(place ?? null);
    storeDistricts(districts);
    leaveLink();
    if (isAuthenticated) {
      void save({
        address: matchedAddress ?? "",
        congressionalDistrict: String(districts.congressional),
        stateSenateDistrict: String(districts.senate),
        stateAssemblyDistrict: String(districts.assembly),
        ...(place ? { ward: place.ward } : {}),
      });
    }
  };

  const ballot = useMemo(() => (shown.from === "none" ? null : voterBallot(data, shown.districts)), [data, shown]);
  // The fold-out exists only once a ballot is drawn, which can be after the
  // first render (remembered districts load from storage), so check again then,
  // and on a same-page jump to #lookup.
  const hasBallot = ballot !== null;
  useEffect(() => {
    if (!hasBallot) return;
    const openFromHash = () => {
      if (window.location.hash === "#lookup") openLookup();
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [hasBallot]);
  const numbers = useMemo(() => numbered(ballot?.contests ?? []), [ballot]);
  const { decisions, oneName } = useMemo(() => byAttention(ballot?.contests ?? []), [ballot]);

  const sections: NavSection[] = useMemo(
    () =>
      order === "ballot"
        ? [
            { id: "contests", label: "Contests", count: ballot?.contests.length },
            { id: "questions", label: "Questions", count: questionCount },
          ]
        : [
            ...(decisions.length > 0 ? [{ id: "decisions", label: "Decisions", count: decisions.length }] : []),
            ...(oneName.length > 0 ? [{ id: "one-name", label: "One name", count: oneName.length }] : []),
            { id: "questions", label: "Questions", count: questionCount },
          ],
    [order, ballot, decisions.length, oneName.length, questionCount],
  );

  const certified = data.ballotSource.url ? (
    <p className="mt-2 font-mono text-xs uppercase tracking-wide">
      Names and order from{" "}
      <a href={data.ballotSource.url} target="_blank" rel="noopener noreferrer" className={`tap ${LINK}`}>
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
        <h2 ref={headline} tabIndex={-1} className="font-display flex flex-wrap gap-x-3 gap-y-1 text-lg leading-tight outline-none sm:gap-x-5 sm:text-3xl">
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
            <button type="button" onClick={openLookup} className={`min-h-11 ${LINK}`}>
              Enter my address
            </button>
            {own && (
              <>
                {" or "}
                <button
                  type="button"
                  onClick={() => {
                    showNext.current = true;
                    leaveLink();
                  }}
                  className={`min-h-11 ${LINK}`}
                >
                  show my own ballot
                </button>
              </>
            )}
          </p>
        )}
        <details id="lookup" ref={lookup} className="mt-3 scroll-mt-16 border-t-2 border-dashed border-border pt-1">
          <summary className={`inline-flex min-h-11 cursor-pointer items-center ${LINK}`}>
            {shown.from === "link" ? "See your own ballot" : "Change address"}
          </summary>
          <div className="pb-2 pt-2">
            <BallotLookup counties={countyChoices} onFound={keepDistricts} />
          </div>
        </details>
      </section>

      {pollingPlace && shown.from !== "link" && <PollingPlaceCard place={pollingPlace} />}

      {ballot.county.status !== "ok" && (
        <section className="mt-5 border-2 border-border bg-card p-4">
          {ballot.county.status === "not-certified" ? (
            <p>
              County offices aren’t loaded yet. <MyVote>See your full ballot at MyVote</MyVote>.
            </p>
          ) : shown.from === "link" ? (
            // Someone else's link: adding a county here would save their districts as the visitor's own.
            <p>
              This link doesn’t say which county, so county offices aren’t shown. Enter your own address below to see yours, or{" "}
              <MyVote>see your full ballot at MyVote</MyVote>.
            </p>
          ) : (
            <>
              <p className="font-bold">We couldn’t tell which county this is, so county offices aren’t shown.</p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="text-sm font-bold">
                  Your county
                  <select
                    value={countyPick}
                    onChange={(event) => setCountyPick(event.target.value)}
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
                <button
                  type="button"
                  disabled={!countyPick}
                  onClick={() => {
                    // The county alone: kept on this device. A saved account's address is left as it is.
                    showNext.current = true;
                    storeDistricts({ ...districts, county: countyPick });
                  }}
                  className={`press min-h-11 border-2 border-border bg-secondary px-4 font-bold shadow-[var(--shadow-brutal)] disabled:opacity-60 ${FOCUS}`}
                >
                  Show county offices
                </button>
              </div>
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
                {oneName.some((contest) => contest.candidates.length === 0)
                  ? `These ${oneName.length} offices have one candidate on the ballot, or none.`
                  : oneName.length === 1
                    ? "This office has a single candidate on the ballot."
                    : `These ${oneName.length} offices have a single candidate on the ballot.`}
              </p>
              <div className="mt-4">
                <OneNameStrip contests={oneName} numbers={numbers} />
              </div>
            </section>
          )}
        </>
      )}

      {ballot.absent.length > 0 && (
        <div className="mt-6 max-w-2xl border-2 border-border bg-card p-4">
          {ballot.absent.map((seat) => (
            <p key={seat.office}>
              The state’s list has no {seat.office} contest for District {seat.district} in 2026.
            </p>
          ))}
          <p className="mt-2 text-sm">
            If you picked your districts by hand, <MyVote>check them at MyVote</MyVote>.
          </p>
        </div>
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

      {shown.from === "device" && (
        <section className="mt-10 border-t-2 border-border pt-6">
          <p className="text-sm">
            Your districts are remembered on this device only.{" "}
            <button type="button" onClick={clearStoredDistricts} className={`min-h-11 ${LINK}`}>
              Forget them
            </button>
          </p>
        </section>
      )}
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
        <a href="/es/vote" lang="es" className={`inline-flex min-h-11 items-center ${LINK}`}>
          Información para votar en español
        </a>
      </p>
    </div>
  );
}
