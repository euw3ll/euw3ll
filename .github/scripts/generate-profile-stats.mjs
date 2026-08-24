import { mkdir, writeFile } from "node:fs/promises";

const username = process.env.PROFILE_USERNAME;
const token = process.env.PROFILE_STATS_TOKEN;

if (!username) throw new Error("PROFILE_USERNAME não definido");
if (!token) throw new Error("PROFILE_STATS_TOKEN não definido");

const browserHeaders = {
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": "euw3ll-profile-activity-card"
};

const apiHeaders = {
  "Accept": "application/vnd.github+json",
  "Authorization": "Bearer " + token,
  "User-Agent": browserHeaders["User-Agent"],
  "X-GitHub-Api-Version": "2022-11-28"
};

const contributionsResponse = await fetch(
  "https://github.com/users/" + encodeURIComponent(username) + "/contributions",
  { headers: browserHeaders }
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
    count: countMatch ? Number(countMatch[1]) : 0
  });
}

days.sort((a, b) => a.date.localeCompare(b.date));
if (days.length < 300) {
  throw new Error("Calendário incompleto: apenas " + days.length + " dias encontrados");
}

const userResponse = await fetch(
  "https://api.github.com/users/" + encodeURIComponent(username),
  { headers: apiHeaders }
);
if (!userResponse.ok) {
  throw new Error("Falha ao buscar perfil: HTTP " + userResponse.status);
}
const user = await userResponse.json();

const repositoriesResponse = await fetch(
  "https://api.github.com/user/repos?per_page=100&affiliation=owner&sort=pushed",
  { headers: apiHeaders }
);
if (!repositoriesResponse.ok) {
  throw new Error("Falha ao listar repositórios: HTTP " + repositoriesResponse.status);
}

const repositories = await repositoriesResponse.json();
const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
const activeRepositories = repositories.filter(repo =>
  repo.owner?.login?.toLowerCase() === username.toLowerCase() &&
  !repo.fork &&
  !repo.archived &&
  repo.pushed_at &&
  Date.parse(repo.pushed_at) >= cutoff
);

if (activeRepositories.length === 0) {
  throw new Error("Nenhum repositório ativo encontrado nos últimos 90 dias");
}

const languageTotals = {};
await Promise.all(activeRepositories.map(async repo => {
  const response = await fetch(repo.languages_url, { headers: apiHeaders });
  if (!response.ok) {
    throw new Error("Falha ao buscar linguagens de " + repo.name + ": HTTP " + response.status);
  }

  const repositoryLanguages = await response.json();
  for (const [language, bytes] of Object.entries(repositoryLanguages)) {
    languageTotals[language] = (languageTotals[language] || 0) + bytes;
  }
}));

const sortedLanguages = Object.entries(languageTotals)
  .sort(([, a], [, b]) => b - a);
const totalLanguageBytes = sortedLanguages.reduce((sum, [, bytes]) => sum + bytes, 0);

if (totalLanguageBytes === 0) {
  throw new Error("Os repositórios ativos não possuem linguagens detectáveis");
}

const languageColors = {
  "TypeScript": "#3178c6",
  "Python": "#3572A5",
  "JavaScript": "#f1e05a",
  "HTML": "#e34c26",
  "CSS": "#563d7c",
  "Vue": "#41b883",
  "Shell": "#89e051",
  "Dockerfile": "#384d54",
  "Go": "#00ADD8",
  "Rust": "#dea584",
  "Java": "#b07219",
  "PHP": "#4F5D95",
  "Ruby": "#701516",
  "Dart": "#00B4AB",
  "C": "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  "Svelte": "#ff3e00",
  "SCSS": "#c6538c"
};
const fallbackColors = ["#fe428e", "#a9fef7", "#7d5bbe", "#f8d866"];

const topLanguages = sortedLanguages.slice(0, 4).map(([name, bytes], index) => ({
  name,
  bytes,
  percentage: bytes / totalLanguageBytes * 100,
  color: languageColors[name] || fallbackColors[index]
}));
const topLanguageBytes = topLanguages.reduce((sum, language) => sum + language.bytes, 0);
const otherLanguageBytes = totalLanguageBytes - topLanguageBytes;
const languageSegments = [
  ...topLanguages,
  ...(otherLanguageBytes > 0 ? [{
    name: "Outras",
    bytes: otherLanguageBytes,
    percentage: otherLanguageBytes / totalLanguageBytes * 100,
    color: "#3a3048"
  }] : [])
];

const total = days.reduce((sum, day) => sum + day.count, 0);
const activeDays = days.filter(day => day.count > 0).length;
const last30 = days.slice(-30).reduce((sum, day) => sum + day.count, 0);
const dailyRecord = Math.max(...days.map(day => day.count));

let longestStreak = 0;
let runningStreak = 0;
for (const day of days) {
  runningStreak = day.count > 0 ? runningStreak + 1 : 0;
  longestStreak = Math.max(longestStreak, runningStreak);
}

const formatter = new Intl.NumberFormat("pt-BR");
const escapeXml = value => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

let barCursor = 30;
const languageBar = languageSegments.map((language, index) => {
  const remainingWidth = 670 - barCursor;
  const width = index === languageSegments.length - 1
    ? remainingWidth
    : 640 * language.bytes / totalLanguageBytes;
  const rect = "<rect x=\"" + barCursor.toFixed(2) + "\" y=\"151\" width=\"" + Math.max(width, 0).toFixed(2) + "\" height=\"10\" fill=\"" + language.color + "\"/>";
  barCursor += width;
  return rect;
}).join("");

const languageLegend = topLanguages.map((language, index) => {
  const x = 30 + index * 160;
  return [
    "<circle cx=\"" + (x + 5) + "\" cy=\"190\" r=\"5\" fill=\"" + language.color + "\"/>",
    "<text x=\"" + (x + 18) + "\" y=\"195\" fill=\"#f8f8f2\" font-size=\"12\" font-weight=\"600\">" + escapeXml(language.name) + "<tspan fill=\"#a9fef7\" font-weight=\"500\">  " + Math.round(language.percentage) + "%</tspan></text>"
  ].join("");
}).join("");

const updatedAt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
}).format(new Date());

const metric = (x, value, label) => [
  "<text x=\"" + x + "\" y=\"82\" fill=\"#f8f8f2\" font-size=\"24\" font-weight=\"700\">" + formatter.format(value) + "</text>",
  "<text x=\"" + x + "\" y=\"103\" fill=\"#a9fef7\" font-size=\"12\">" + label + "</text>"
].join("");

const svg = [
  "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"700\" height=\"235\" viewBox=\"0 0 700 235\" role=\"img\" aria-label=\"Estatísticas e linguagens de " + escapeXml(username) + " no GitHub\">",
  "<defs><clipPath id=\"language-bar\"><rect x=\"30\" y=\"151\" width=\"640\" height=\"10\" rx=\"5\"/></clipPath></defs>",
  "<rect width=\"699\" height=\"234\" x=\"0.5\" y=\"0.5\" rx=\"12\" fill=\"#141321\" stroke=\"#e4e2e2\" stroke-opacity=\"0.18\"/>",
  "<g font-family=\"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif\">",
  "<text x=\"30\" y=\"38\" fill=\"#fe428e\" font-size=\"20\" font-weight=\"700\">Atividade de " + escapeXml(username) + " no GitHub</text>",
  metric(30, total, "contribuições / 12 meses"),
  metric(190, last30, "nos últimos 30 dias"),
  metric(340, activeDays, "dias ativos"),
  metric(450, longestStreak, "maior sequência"),
  metric(575, dailyRecord, "recorde diário"),
  "<text x=\"30\" y=\"134\" fill=\"#f8f8f2\" font-size=\"12\" font-weight=\"600\">Linguagens mais usadas</text>",
  "<text x=\"670\" y=\"134\" text-anchor=\"end\" fill=\"#6e5a7e\" font-size=\"10\">" + activeRepositories.length + " projetos ativos • últimos 90 dias</text>",
  "<g clip-path=\"url(#language-bar)\">" + languageBar + "</g>",
  languageLegend,
  "<text x=\"30\" y=\"220\" fill=\"#6e5a7e\" font-size=\"10\">Atualizado em " + updatedAt + " • fonte: GitHub</text>",
  "</g>",
  "</svg>"
].join("");

await mkdir("profile", { recursive: true });
await writeFile("profile/stats.svg", svg, "utf8");

console.log("Cartão gerado para " + user.login + ": " + total + " contribuições, " + activeRepositories.length + " projetos ativos e " + topLanguages.length + " linguagens em destaque.");
