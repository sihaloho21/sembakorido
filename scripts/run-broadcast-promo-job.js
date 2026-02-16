#!/usr/bin/env node

/**
 * Broadcast Promo runner for GAS backend.
 *
 * Usage:
 *   node scripts/run-broadcast-promo-job.js enqueue --campaign FEB_DORMANT_01 --segment dormant_30d --limit 200
 *   node scripts/run-broadcast-promo-job.js send --campaign FEB_DORMANT_01 --limit 100
 *   node scripts/run-broadcast-promo-job.js send --campaign FEB_DORMANT_01 --dry-run
 *
 * Required env:
 *   GAS_API_URL=https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec
 *   GAS_ADMIN_TOKEN=...
 *
 * Optional env:
 *   GAS_ADMIN_ROLE=superadmin|manager|operator (default: manager)
 */

const ALLOWED_COMMANDS = {
  enqueue: "broadcast_promo_enqueue",
  send: "broadcast_promo_send",
};

function printUsage() {
  console.log(
    [
      "Broadcast Promo Job Runner",
      "",
      "Commands:",
      "  enqueue   Build queue targets for a campaign",
      "  send      Send queued targets via WhatsApp webhook channel",
      "",
      "Options:",
      "  --campaign <code>         Campaign code (required)",
      "  --segment <segment_code>  Segment override (enqueue only)",
      "  --limit <n>               Max records to process",
      "  --actor <name>            Actor label for audit trail",
      "  --dry-run                 Run without mutating queue/sending",
      "  --force                   Ignore feature toggle (enqueue only)",
      "  --ignore-quiet-hours      Allow send during quiet hours (send only)",
      "  --json                    Output raw JSON only",
      "",
      "Environment:",
      "  GAS_API_URL               GAS web app URL",
      "  GAS_ADMIN_TOKEN           Admin token",
      "  GAS_ADMIN_ROLE            Default: manager",
      "",
      "Examples:",
      "  node scripts/run-broadcast-promo-job.js enqueue --campaign FEB_DORMANT_01 --segment dormant_30d --limit 200",
      "  node scripts/run-broadcast-promo-job.js send --campaign FEB_DORMANT_01 --limit 100",
      "  node scripts/run-broadcast-promo-job.js send --campaign FEB_DORMANT_01 --dry-run",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const flags = {
    campaign: "",
    segment: "",
    actor: "",
    limit: null,
    dryRun: false,
    force: false,
    ignoreQuietHours: false,
    jsonOnly: false,
  };

  for (let i = 1; i < args.length; i += 1) {
    const token = args[i];
    const next = args[i + 1];

    if (token === "--campaign" && next) {
      flags.campaign = String(next).trim();
      i += 1;
      continue;
    }
    if (token === "--segment" && next) {
      flags.segment = String(next).trim();
      i += 1;
      continue;
    }
    if (token === "--actor" && next) {
      flags.actor = String(next).trim();
      i += 1;
      continue;
    }
    if (token === "--limit" && next) {
      const parsed = parseInt(next, 10);
      if (Number.isFinite(parsed) && parsed > 0) flags.limit = parsed;
      i += 1;
      continue;
    }
    if (token === "--dry-run") {
      flags.dryRun = true;
      continue;
    }
    if (token === "--force") {
      flags.force = true;
      continue;
    }
    if (token === "--ignore-quiet-hours") {
      flags.ignoreQuietHours = true;
      continue;
    }
    if (token === "--json") {
      flags.jsonOnly = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      flags.help = true;
      continue;
    }
  }

  return { command, flags };
}

function buildPayload(command, flags) {
  const action = ALLOWED_COMMANDS[command];
  if (!action) {
    throw new Error(`Unknown command: ${command || "(empty)"}`);
  }

  if (!flags.campaign) {
    throw new Error("Missing required option: --campaign <code>");
  }

  const data = {
    campaign_code: flags.campaign,
    dry_run: Boolean(flags.dryRun),
  };

  if (flags.limit) data.limit = flags.limit;
  if (flags.actor) data.actor = flags.actor;

  if (command === "enqueue") {
    if (flags.segment) data.segment_code = flags.segment;
    if (flags.force) data.force = true;
  }

  if (command === "send") {
    if (flags.ignoreQuietHours) data.ignore_quiet_hours = true;
  }

  const token = String(process.env.GAS_ADMIN_TOKEN || "").trim();
  const adminRole = String(process.env.GAS_ADMIN_ROLE || "manager").trim().toLowerCase();

  return {
    action,
    token,
    admin_role: adminRole,
    data,
  };
}

async function run() {
  const { command, flags } = parseArgs(process.argv);

  if (!command || flags.help || command === "--help" || command === "-h") {
    printUsage();
    process.exit((flags.help || command === "--help" || command === "-h") ? 0 : 1);
  }

  const apiUrl = String(process.env.GAS_API_URL || "").trim();
  if (!apiUrl) {
    throw new Error("Missing env GAS_API_URL");
  }

  const payload = buildPayload(command, flags);

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Non-JSON response (${res.status}): ${raw.slice(0, 400)}`);
  }

  if (flags.jsonOnly) {
    process.stdout.write(JSON.stringify(parsed));
    process.stdout.write("\n");
  } else {
    console.log(`HTTP ${res.status}`);
    console.log(JSON.stringify(parsed, null, 2));
  }

  if (!res.ok) {
    process.exit(1);
  }

  if (parsed && parsed.success === false) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error("Broadcast job failed:", error.message || error);
  process.exit(1);
});
