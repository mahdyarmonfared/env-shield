# 🛡️ EnvShield

> **Zero-dependency environment variable validator, security auditor, and visual sync studio for modern software engineering teams.**

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Dependencies](https://img.shields.io/badge/Dependencies-0%20(Pure%20Core)-blue)](package.json)
[![Tests](https://img.shields.io/badge/Tests-27%2F27%20Passing-brightgreen)](test/)
[![Port](https://img.shields.io/badge/Web%20Studio-Port%203010-79c0ff)](http://localhost:3010)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 💡 Why EnvShield?

Missing environment variables are one of the most frustrating causes of **broken CI/CD pipelines**, **failed production deployments**, and **"it works on my machine"** team discrepancies. Worse, committing unmonitored `.env` files can leak live AWS credentials, database URIs, or Stripe secret keys in seconds.

**EnvShield** solves this once and for all:
- ❌ **No more broken builds**: Guarantees your `.env` satisfies all keys required by `.env.example`.
- 🔄 **One-click synchronization**: Safely merges new keys from `.env.example` into `.env` with automated backups and comment preservation.
- 🔒 **Active Secret Radar**: Detects exposed API keys (AWS, OpenAI, Stripe, GitHub, Private Keys) and verifies `.gitignore` protection before commits happen.
- 🌐 **Interactive Web Studio**: Dual-pane visual interface running locally on **port 3010** with secret masking, comparative matrix, and live editors.
- ⚡ **Pure Standard Library**: Exactly 0 npm dependencies — blazing fast execution and zero supply-chain risk.

---

## ⚡ Quick Start

Run instantly with `npx` (no installation required):

```bash
# Validate your current .env against .env.example
npx env-shield check

# Sync missing variables into .env with auto-backup
npx env-shield sync

# Run security audit (scans for leaked secrets & git exposure)
npx env-shield audit

# Launch the visual Web Studio
npx env-shield ui
```

Or install globally:

```bash
npm install -g env-shield
envshield --help
```

---

## 🖥️ Visual Web Studio (Port 3010)

Launch the visual dashboard locally with:

```bash
envshield ui
# Or with custom port:
envshield ui --port 3010
```

Open your browser to `http://localhost:3010` to access:
- **Comparative Variable Matrix**: Side-by-side status badges (`SYNCED`, `MISSING`, `EMPTY`, `PLACEHOLDER`, `TYPE ERROR`, `EXTRA`).
- **One-Click Sync**: Merge missing template keys into `.env` with a single click.
- **Dual Raw Editor**: In-browser split-view editor for both `.env` and `.env.example` with atomic saving and automated backups.
- **Security & Secret Radar**: Real-time status of `.gitignore` exclusion, POSIX permission bits (`0600`), and live leaked credentials.
- **Secret Masking Toggle**: Easily present or screen-share your dashboard without revealing production credentials.

---

## 🛠️ CLI Reference

### 1. `envshield check` (Default)
Validates that all variables in `.env.example` exist and are valid in `.env`. Exits with code `0` if valid, or `1` if issues are found (ideal for CI/CD gates).

```bash
# Basic check
envshield check

# Strict mode: also fails if undocumented variables exist in .env
envshield check --strict

# Output machine-readable JSON for automated scripts
envshield check --json

# Custom file paths
envshield check --env .env.production --example .env.example
```

### 2. `envshield sync`
Automatically merges missing variables from `.env.example` into `.env`. Preserves all comments, line breaks, formatting, and creates a timestamped backup (`.env.bak.<timestamp>`).

```bash
# Safe sync with backup
envshield sync

# Dry-run preview without modifying disk
envshield sync --dry-run

# Skip backup creation
envshield sync --no-backup
```

### 3. `envshield audit`
Performs a deep security audit across your environment files:
- **Secret Scanner**: Identifies hardcoded AWS Access Keys (`AKIA...`), OpenAI tokens (`sk-...`), Stripe keys (`sk_live_...`), GitHub PATs, JWT tokens, and SSH private keys.
- **Git Protection Verification**: Verifies whether `.env` is covered by `.gitignore` in your repository.
- **POSIX Permission Audit**: Warns if `.env` has permissive permissions (`0644`) and recommends `chmod 600`.
- **Health Score**: Computes an overall Security Score from `0` to `100`.

```bash
envshield audit
```

### 4. `envshield gen-example`
Automatically creates a sanitized `.env.example` template from an existing `.env` file, replacing all live values with safe, type-inferred placeholders.

```bash
envshield gen-example --env .env --out .env.example
```

---

## 🚦 CI/CD Integration (GitHub Actions)

Add EnvShield to your GitHub Actions workflow to block PRs with missing environment variables or exposed secrets:

```yaml
name: Environment Integrity Check

on: [push, pull_request]

jobs:
  validate-env:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Validate .env template integrity
        run: npx env-shield check --strict
```

---

## 🔬 Architecture & Quality

```text
env-shield/
├── bin/
│   └── env-shield.js         # Executable CLI entrypoint (chmod +x)
├── src/
│   ├── core/
│   │   ├── env-parser.js       # Lossless tokenizer & parser (comments, quotes, multiline)
│   │   ├── type-infer.js       # Type detection (port, number, boolean, url, email, json)
│   │   ├── security-auditor.js # Regex secret leak scanner & gitignore verification
│   │   ├── comparator.js       # Multi-file matrix comparison engine
│   │   ├── syncer.js           # Atomic file sync with automated timestamped backups
│   │   ├── generator.js        # Sanitized .env.example generator
│   │   └── index.js            # Unified core API
│   ├── cli/
│   │   ├── ansi.js             # Zero-dependency ANSI colors & ASCII table formatter
│   │   └── runner.js           # Command dispatcher and argument parser
│   ├── server/
│   │   └── server.js           # Lightweight HTTP server & REST API (Path-traversal safe)
│   └── ui/
│       ├── index.html          # Modern dark-mode dashboard
│       ├── style.css           # Devtools aesthetic & responsive styling
│       └── app.js              # Client-side reactivity & API integration
└── test/
    ├── env-parser.test.js      # Parser test suite
    ├── type-infer.test.js      # Type validation test suite
    ├── security-auditor.test.js# Secret scanner test suite
    ├── comparator.test.js      # Comparator test suite
    ├── syncer.test.js          # Sync & backup test suite
    └── server.test.js          # HTTP API & security tests
```

### Running Tests

EnvShield uses Node.js's native test runner (`node:test`):

```bash
npm test
# Or:
node --test test/*.test.js
```

All **27 test cases** run in **~300ms** without any external test frameworks.

---

## 📄 License

MIT © [Mahdyar Monfared](https://github.com/mahdyarmonfared)
