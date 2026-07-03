#!/usr/bin/env node
// Minimal chromium-cli-alike REPL for driving Resitrat in a headless browser.
// Reads one command per line from stdin, executes it against a persistent
// page, prints a one-line result per command. Designed to be piped a heredoc:
//
//   node driver.mjs <<'EOF'
//   nav http://localhost:8080/login.html
//   wait-for text=Entrar
//   screenshot login
//   EOF
//
// Screenshots land in .claude/skills/run-resitrat/screenshots/<name>.png
import { chromium } from 'playwright';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const consoleMsgs = [];
page.on('console', (msg) => consoleMsgs.push({ type: msg.type(), text: msg.text() }));
page.on('pageerror', (err) => consoleMsgs.push({ type: 'pageerror', text: String(err) }));
page.on('dialog', async (dialog) => {
  consoleMsgs.push({ type: 'dialog', text: `[${dialog.type()}] ${dialog.message()}` });
  await dialog.accept();
});

function splitArgs(line) {
  // supports: cmd arg1 "arg with spaces" arg3
  const parts = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(line)) !== null) parts.push(m[1] !== undefined ? m[1] : m[2]);
  return parts;
}

async function runCommand(line) {
  line = line.trim();
  if (!line || line.startsWith('#')) return;
  const [cmd, ...rest] = splitArgs(line);
  try {
    switch (cmd) {
      case 'nav': {
        await page.goto(rest[0], { waitUntil: 'domcontentloaded' });
        console.log(`OK nav ${rest[0]}`);
        break;
      }
      case 'wait-for': {
        const sel = rest.join(' ');
        if (sel.startsWith('text=')) {
          await page.getByText(sel.slice(5), { exact: false }).first().waitFor({ timeout: 15000 });
        } else {
          await page.waitForSelector(sel, { timeout: 15000 });
        }
        console.log(`OK wait-for ${sel}`);
        break;
      }
      case 'click': {
        const sel = rest.join(' ');
        if (sel.startsWith('text=')) {
          await page.getByText(sel.slice(5), { exact: false }).first().click();
        } else {
          await page.click(sel);
        }
        console.log(`OK click ${sel}`);
        break;
      }
      case 'fill': {
        const [sel, ...valParts] = rest;
        await page.fill(sel, valParts.join(' '));
        console.log(`OK fill ${sel}`);
        break;
      }
      case 'press': {
        await page.keyboard.press(rest.join(' '));
        console.log(`OK press ${rest.join(' ')}`);
        break;
      }
      case 'eval': {
        const result = await page.evaluate(rest.join(' '));
        console.log(`OK eval -> ${JSON.stringify(result)}`);
        break;
      }
      case 'screenshot': {
        const name = rest[0] || `shot-${Date.now()}`;
        const file = path.join(SHOTS_DIR, `${name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(`OK screenshot -> ${file}`);
        break;
      }
      case 'console-errors': {
        const errs = consoleMsgs.filter((m) => m.type === 'error' || m.type === 'pageerror');
        console.log(errs.length ? JSON.stringify(errs, null, 2) : 'OK no console errors');
        break;
      }
      case 'sleep': {
        await page.waitForTimeout(Number(rest[0] || 1000));
        console.log(`OK sleep ${rest[0]}`);
        break;
      }
      case 'quit':
      case 'exit': {
        await browser.close();
        process.exit(0);
      }
      default:
        console.log(`ERR unknown command: ${cmd}`);
    }
  } catch (e) {
    console.log(`ERR ${cmd}: ${e.message.split('\n')[0]}`);
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
for await (const line of rl) {
  await runCommand(line);
}
await browser.close();
process.exit(0);
