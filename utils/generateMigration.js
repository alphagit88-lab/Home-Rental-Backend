const fs = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

const printUsage = () => {
  console.log("Usage:");
  console.log("  npm run migration:generate -- add_new_table");
  console.log("  npm run migration:generate -- --name=add_new_table");
  console.log("  npm run migration:generate -- --name=add_new_table --dry-run");
};

const sanitizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

const parseArgs = (argv) => {
  const parsed = {
    dryRun: false,
    name: "",
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const currentArg = argv[index];

    if (currentArg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (currentArg.startsWith("--name=")) {
      parsed.name = currentArg.slice("--name=".length);
      continue;
    }

    if (currentArg === "--name") {
      parsed.name = argv[index + 1] || "";
      index += 1;
      continue;
    }

    positional.push(currentArg);
  }

  if (!parsed.name && positional.length > 0) {
    parsed.name = positional.join("_");
  }

  if (!parsed.name && process.env.npm_config_name) {
    parsed.name = process.env.npm_config_name;
  }

  parsed.name = sanitizeName(parsed.name);
  return parsed;
};

const getNextMigrationNumber = (files) => {
  const maxNumber = files.reduce((highest, fileName) => {
    const match = fileName.match(/^(\d+)_/);

    if (!match) {
      return highest;
    }

    const parsedNumber = parseInt(match[1], 10);
    return Number.isInteger(parsedNumber) ? Math.max(highest, parsedNumber) : highest;
  }, 0);

  return String(maxNumber + 1).padStart(3, "0");
};

const buildTemplate = (migrationName) => `-- Migration: ${migrationName}
-- Created at: ${new Date().toISOString()}

BEGIN;

-- Write your migration here.

COMMIT;
`;

const main = () => {
  const { dryRun, name } = parseArgs(process.argv.slice(2));

  if (!name) {
    console.error("Migration name is required.");
    printUsage();
    process.exit(1);
  }

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((fileName) => fileName.endsWith(".sql"));
  const nextNumber = getNextMigrationNumber(files);
  const fileName = `${nextNumber}_${name}.sql`;
  const filePath = path.join(MIGRATIONS_DIR, fileName);

  if (dryRun) {
    console.log(`Dry run: would create ${fileName}`);
    return;
  }

  if (fs.existsSync(filePath)) {
    console.error(`Migration already exists: ${fileName}`);
    process.exit(1);
  }

  fs.writeFileSync(filePath, buildTemplate(name), { encoding: "utf8", flag: "wx" });
  console.log(`Created migration: ${fileName}`);
};

main();
