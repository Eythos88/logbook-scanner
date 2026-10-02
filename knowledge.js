/* Default "master list" — seeds the editable knowledge in Settings on first run.
   Seeded from the shorthand actually used in HD39 DPR Sept 2026. Anything marked "?" is a term
   the crew uses whose meaning Mike still needs to fill in — the model is told "?" means unknown.
   This file is PUBLIC (GitHub Pages) — no client, field or personnel names here; add those in
   Settings on the phone, where they stay on the device. */
(function (root) {
  'use strict';

  const ROVS = ['HD39', 'HD55'];

  const KNOWLEDGE = {
    abbrev:
`# Standard DPR abbreviations — keep these AS abbreviations in the DPR.
TMS = Tether Management System
VM = vessel move
SOZ = safe operating zone
GVI = general visual inspection
AFI = awaiting further instructions
RTS = return to surface
HSE = health, safety & environment
TRA = task risk assessment
TBT = toolbox talk
OCM = offshore construction manager
MSW = metres of sea water (depth)
HDG = heading
WOW = waiting on weather
TDP = touchdown point
STBD = starboard
FWD = forward
LOTO = lockout / tagout
LARS = launch and recovery system
MRU = motion reference unit
HIPAP = HiPAP acoustic positioning
IMF = ?
QD = ?

# Personal shorthand — write these OUT in full.
w/ = with
chk = check
@ = at (keep "@" before a depth or time, e.g. "@ 10m")`,

    field:
`# Field, structure & item IDs — copy IDs exactly in the form shown here.
MDF = mattress deployment frame (handwriting may say MFD / FMD — always write MDF)
LBW-01 … LBW-11 = lift bags (check: pick one style — LBW-05 or LBW05)
LBW05A = lift bag 5A
GB-01 … GB-10 = grout bags (check: GB-01 or GB01)
FOC-xx / SFOC xx = mattress IDs (e.g. FOC-20, SFOC 24)
SP01 … SP03 = ?
Carousel = air-hose carousel (subsea basket)
Seabird = ?`,

    rov:
`# General ROV operations knowledge
Dive sequence: pre-dive checks → "Dive" (launch) → TMS all-stop @ depth → ROV out of TMS → work → ROV in TMS → "Location" (system on deck) → post-dive checks.
"Dive" and "Location" are single-word marker lines in the DPR — keep them exactly as one word.
Vessel moves are logged as "VM to …" then "VM complete."
Shift change happens at 11:45 / 23:45 after a pre-shift meeting at 11:30 / 23:30.
The day opens "Begin this day, …" at 00:00 and closes "End this day, …" at 24:00.`,

    tooling:
`# General ROV tooling
manipulator (5-function / 7-function arm)
torque tool, hot stab, cutter, wire-rope cutter
air hose / air nozzle (for filling lift bags)
CP probe
rigging, slings, shackles, crane hook
T4 filter = ?`,
  };

  // Real lines from the master book — the house style the cleanup should match.
  const STYLE_EXAMPLES = [
    'Begin this day, HD39 on deck. Vessel on location.',
    "Crew review HSE paperwork for today's planned tasks.",
    'Pre-dive checks-all good.',
    'Dive',
    'HD39 TMS allstop @ 10m.',
    'HD39 out of TMS heading to LBW-07.',
    'HD39 removing LBW-07 from pipeline. Will not hold air.',
    'HD39 installed LBW-07 to basket, 100% tied off.',
    'VM complete, HD39 heading to LBW-10.',
    'Crane @ 15m.',
    'HD39 disconnects crane from carousel / Crane clear to deck.',
    'Pictures taken of LBW-09/LBW-10 leak points.',
    'ROV in TMS, return to surface due to incoming weather.',
    'Location',
    'Post dive checks.',
    'Oncoming shift attend pre-shift meeting.',
    'Shift change and handover.',
    'End this day, ROV on deck, vessel at anchorage.',
  ];

  root.KB = { ROVS, KNOWLEDGE, STYLE_EXAMPLES };
})(typeof self !== 'undefined' ? self : this);
