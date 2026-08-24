import { mkdir, writeFile } from "node:fs/promises";

const username = process.env.PROFILE_USERNAME;
if (!username) throw new Error("PROFILE_USERNAME não definido");

const headers = {
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": "euw3ll-profile-activity-card"
};

const contributionsResponse = await fetch(
  "https://github.com/users/" + encodeURIComponent(username) + "/contributions",
  { headers }
);
if (!contributionsResponse.ok) {
  throw new Error("Falha ao buscar contribuições: HTTP " + contributionsResponse.status);
}

const html = await contributionsResponse.text();
const days = [];
const cellPattern = /<td[^>]*data-date="([^"]+)"[^>]*data-level="([0-4])"[^>]*>[\s\S]*?<\/td>\s*<tool-tip[^>]*>([^<]+)<\/tool-tip>/g;

for (const match of html.matchAll(cellPattern)) {
  const countMatch = match[3].match(/^(\d+) contributions?/);
  days.push({
    date: match[1],
    level: Number(match[2]),
    count: countMatch ? Number(countMatch[1]) : 0
  });
}

days.sort((a, b) => a.date.localeCompare(b.date));
if (days.length < 300) {
  throw new Error("Calendário incompleto: apenas " + days.length + " dias encontrados");
}

const userResponse = await fetch(
  "https://api.github.com/users/" + encodeURIComponent(username),
  {
    headers: {
      "Accept": "application/vnd.github+json",
      "User-Agent": headers["User-Agent"]
    }
  }
);
if (!userResponse.ok) {
  throw new Error("Falha ao buscar perfil: HTTP " + userResponse.status);
}
const user = await userResponse.json();

const total = days.reduce((sum, day) => sum + day.count, 0);
const activeDays = days.filter(day => day.count > 0).length;
const last30 = days.slice(-30).reduce((sum, day) => sum + day.count, 0);

let longestStreak = 0;
let runningStreak = 0;
for (const day of days) {
  runningStreak = day.count > 0 ? runningStreak + 1 : 0;
  longestStreak = Math.max(longestStreak, runningStreak);
}

const formatter = new Intl.NumberFormat("pt-BR");
const languages = [
  { name: "Python", color: "#3572A5" },
  { name: "JavaScript", color: "#f1e05a" },
  { name: "HTML", color: "#e34c26" },
  { name: "CSS", color: "#563d7c" }
];

const languageCards = languages.map((language, index) => {
  const x = 30 + index * 160;
  return [
    "<g>",
    "<rect x=\"" + x + "\" y=\"174\" width=\"145\" height=\"54\" rx=\"8\" fill=\"" + language.color + "\" fill-opacity=\"0.14\" stroke=\"" + language.color + "\" stroke-opacity=\"0.55\"/>",
    "<circle cx=\"" + (x + 22) + "\" cy=\"201\" r=\"7\" fill=\"" + language.color + "\"/>",
    "<text x=\"" + (x + 38) + "\" y=\"206\" fill=\"#f8f8f2\" font-size=\"14\" font-weight=\"700\">" + language.name + "</text>",
    "</g>"
  ].join("");
}).join("");
const updatedAt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
}).format(new Date());

const metric = (x, value, label) => [
  "<text x=\"" + x + "\" y=\"105\" fill=\"#f8f8f2\" font-size=\"24\" font-weight=\"700\">" + formatter.format(value) + "</text>",
  "<text x=\"" + x + "\" y=\"126\" fill=\"#a9fef7\" font-size=\"12\">" + label + "</text>"
].join("");

const svg = [
  "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"700\" height=\"280\" viewBox=\"0 0 700 280\" role=\"img\" aria-label=\"Atividade de " + username + " no GitHub\">",
  "<rect width=\"699\" height=\"279\" x=\"0.5\" y=\"0.5\" rx=\"12\" fill=\"#141321\" stroke=\"#e4e2e2\" stroke-opacity=\"0.18\"/>",
  "<g font-family=\"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif\">",
  "<text x=\"30\" y=\"36\" fill=\"#fe428e\" font-size=\"20\" font-weight=\"700\">Atividade de " + username + " no GitHub</text>",
  "<text x=\"30\" y=\"58\" fill=\"#a9fef7\" font-size=\"12\">Calendário oficial • contribuições privadas permanecem anônimas</text>",
  metric(30, total, "contribuições / 12 meses"),
  metric(190, last30, "nos últimos 30 dias"),
  metric(340, activeDays, "dias ativos"),
  metric(450, longestStreak, "maior sequência"),
  metric(575, Math.max(...days.map(day => day.count)), "recorde diário"),
  "<text x=\"30\" y=\"158\" fill=\"#f8f8f2\" font-size=\"12\" font-weight=\"600\">Linguagens mais usadas</text>",
  languageCards,
  "<text x=\"30\" y=\"265\" fill=\"#6e5a7e\" font-size=\"10\">Atualizado em " + updatedAt + " • fonte: GitHub</text>",
  "</g>",
  "</svg>"
].join("\n");

await mkdir("profile", { recursive: true });
await writeFile("profile/stats.svg", svg, "utf8");
console.log("Cartão gerado com " + formatter.format(total) + " contribuições.");
