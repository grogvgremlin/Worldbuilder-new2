// Reading and writing the options cells (Equipment Options, Rules Options).
// Notation (format/schemae.csv; build-log Part B decisions 13–15):
//   [A OR B OR C;Mandatory]          choose one of A, B, C; one must be taken
//   Shields(add;+1~pi)               a single option: take it or not
//   Name~Mount(args)[grants]         an option that is a mount, granting things while taken
//   Wizard(4)(replace~Wizard(3);30)  a name with its own detail, then the arguments
//   arguments: add | upgrade | replace~X|Y | a cost | "0-25 total" (a budget) | a count | Only(...) / MayBe(...)
//   +X adds to the inherited options; None removes them all; -X removes one.
// Writing gives one standard form: action; cost or budget; count; conditions.

import type { Option, OptionGroup, Options } from "../items/items";
import { pieces, splitTop } from "./split";
import { readTerm, readTerms, writeTerm, writeTerms } from "./terms";
import { readCost, readRange, writeCost, writeRange, type Problems } from "./values";

export function readOptions(text: string | undefined, problems: Problems): Options | undefined {
  const parts = splitTop(text ?? "", ";");
  if (parts.length === 0) return undefined;
  const cell: Options = { groups: [] };
  for (const part of parts) {
    if (/^none$/i.test(part)) cell.removeAllInherited = true;
    else if (part.startsWith("-") && !/^-\d/.test(part)) (cell.removeInherited ??= []).push(readTerm(part));
    else if (/^mandatory$/i.test(part)) {
      const last = cell.groups[cell.groups.length - 1];
      if (last) last.required = true;
      else problems.push(`"Mandatory" with no group before it`);
    } else if (part.startsWith("[") || part.startsWith("([")) cell.groups.push(readGroup(part, problems));
    else cell.groups.push({ choose: "one", required: false, options: [readOption(part, problems)] });
  }
  return cell;
}

function readGroup(text: string, problems: Problems): OptionGroup {
  let inner = text.trim();
  if (inner.startsWith("(") && inner.endsWith(")")) inner = inner.slice(1, -1).trim();
  if (inner.startsWith("[")) inner = inner.slice(1);
  if (inner.endsWith("]")) inner = inner.slice(0, -1);
  let required = false;
  const optionTexts: string[] = [];
  for (const part of splitTop(inner, ";")) {
    if (/^mandatory$/i.test(part)) required = true;
    else optionTexts.push(part);
  }
  const joined = optionTexts.join(";");
  let members = splitTop(joined, " OR ");
  if (members.length === 1) members = splitTop(joined, ",");
  return { choose: "one", required, options: members.map((m) => readOption(m, problems)) };
}

export function readOption(text: string, problems: Problems): Option {
  let t = text.trim();
  const option: Option = { name: "" };
  if (t.startsWith("+")) {
    option.addsToInherited = true;
    t = t.slice(1).trim();
  }
  const parts = pieces(t);
  const rounds = parts.filter((p) => p.kind === "round");
  // With two round brackets, the first is the name's own detail: Wizard(4)(replace~…;30).
  const args = rounds.length >= 1 ? rounds[rounds.length - 1].text : null;
  for (const part of parts) {
    if (part.kind === "name" && option.name === "") {
      const tilde = part.text.lastIndexOf("~");
      if (tilde > 0) {
        option.name = part.text.slice(0, tilde).trim();
        option.as = part.text.slice(tilde + 1).trim();
      } else option.name = part.text;
    } else if (part.kind === "round" && rounds.length >= 2 && part === rounds[0]) option.detail = part.text;
    else if (part.kind === "as") option.as = part.text;
    else if (part.kind === "square") option.grants = readTerms(part.text, problems);
  }
  if (args !== null) for (const arg of splitTop(args, ";")) readArgument(arg, option, text, problems);
  return option;
}

function readArgument(arg: string, option: Option, whole: string, problems: Problems): void {
  const a = arg.trim();
  if (/^add$/i.test(a)) return void (option.action = "add");
  if (/^upgrade$/i.test(a)) return void (option.action = "upgrade");
  if (/^replace~/i.test(a)) {
    option.action = "replace";
    option.replaces = a.slice(8).split("|").map((x) => readTerm(x));
    return;
  }
  if (/^(only|maybe)\(/i.test(a)) return void (option.conditions ??= []).push(readTerm(a));
  if (/total$/i.test(a)) {
    const quiet: Problems = [];
    const budget = readRange(a.replace(/total$/i, ""), quiet);
    if (budget) option.budget = budget;
    else problems.push(`"${whole}": can't read the budget "${a}"`);
    return;
  }
  const quiet: Problems = [];
  const cost = readCost(a, quiet);
  if (cost && option.cost === undefined) return void (option.cost = cost);
  const count = readRange(a, quiet);
  if (count) return void (option.count = count);
  problems.push(`"${whole}": can't read "${a}"`);
}

// --- Writing ------------------------------------------------------------------------------------

export function writeOptions(cell: Options | undefined): string {
  if (!cell) return "";
  const parts: string[] = [];
  if (cell.removeAllInherited) parts.push("None");
  for (const t of cell.removeInherited ?? []) parts.push(writeTerm({ ...t, change: "remove" }));
  for (const group of cell.groups) parts.push(writeGroup(group));
  return parts.join(";");
}

function writeGroup(group: OptionGroup): string {
  const options = group.options.map(writeOption);
  if (options.length === 1 && !group.required) return options[0];
  return "[" + options.join(" OR ") + (group.required ? ";Mandatory" : "") + "]";
}

export function writeOption(option: Option): string {
  let out = (option.addsToInherited ? "+" : "") + option.name;
  if (option.detail !== undefined) out += `(${option.detail})`;
  if (option.as !== undefined) out += `~${option.as}`;
  const args: string[] = [];
  if (option.action === "replace") args.push("replace~" + (option.replaces ?? []).map((t) => writeTerm(t)).join("|"));
  else if (option.action) args.push(option.action);
  else if (option.budget && !option.cost) args.push(""); // the sheet's form: Magic Items(;0-50 total)
  if (option.cost) args.push(writeCost(option.cost));
  if (option.budget) args.push(writeRange(option.budget) + " total");
  if (option.count) args.push(writeRange(option.count));
  for (const c of option.conditions ?? []) args.push(writeTerm(c));
  if (args.length > 0 || option.detail !== undefined) out += `(${args.join(";")})`;
  if (option.grants) out += `[${writeTerms(option.grants)}]`;
  return out;
}
