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
const colors = ["#2a2039", "#4b1f53", "#7d2468", "#c72c7d", "#fe428e"];
const recentDays = days.slice(-364);
const heatmap = recentDays.map((day, index) => {
  const column = Math.floor(index / 7);
  const row = index % 7;
  const x = 30 + column * 10;
  const y = 174 + row * 10;
  return [
    "<rect x=\"" + x + "\" y=\"" + y + "\" width=\"7\" height=\"7\" rx=\"1.5\" fill=\"" + colors[day.level] + "\">",
    "<title>" + day.date + ": " + day.count + " contribuições</title>",
    "</rect>"
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
  metric(575, user.public_repos, "repos públicos"),
  "<text x=\"30\" y=\"158\" fill=\"#f8f8f2\" font-size=\"12\" font-weight=\"600\">Ritmo de contribuições</text>",
  heatmap,
  "<text x=\"570\" y=\"241\" fill=\"#6e5a7e\" font-size=\"10\">menos</text>",
  "<rect x=\"608\" y=\"233\" width=\"7\" height=\"7\" rx=\"1.5\" fill=\"#2a2039\"/>",
  "<rect x=\"619\" y=\"233\" width=\"7\" height=\"7\" rx=\"1.5\" fill=\"#4b1f53\"/>",
  "<rect x=\"630\" y=\"233\" width=\"7\" height=\"7\" rx=\"1.5\" fill=\"#7d2468\"/>",
  "<rect x=\"641\" y=\"233\" width=\"7\" height=\"7\" rx=\"1.5\" fill=\"#c72c7d\"/>",
  "<rect x=\"652\" y=\"233\" width=\"7\" height=\"7\" rx=\"1.5\" fill=\"#fe428e\"/>",
  "<text x=\"664\" y=\"241\" fill=\"#6e5a7e\" font-size=\"10\">mais</text>",
  "<text x=\"30\" y=\"265\" fill=\"#6e5a7e\" font-size=\"10\">Atualizado em " + updatedAt + " • fonte: GitHub</text>",
  "</g>",
  "</svg>"
].join("\n");

await mkdir("profile", { recursive: true });
await writeFile("profile/stats.svg", svg, "utf8");
console.log("Cartão gerado com " + formatter.format(total) + " contribuições.");
