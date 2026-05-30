var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_genai = require("@google/genai");
var import_firestore = require("@google-cloud/firestore");
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = Number(process.env.PORT || 3e3);
app.set("trust proxy", 1);
app.use(import_express.default.json());
var apiKey = process.env.GEMINI_API_KEY;
var aiClient = null;
function getAiClient() {
  if (!aiClient) {
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY environment variable is not set. Chat features will fallback to rule-based responses.");
    }
    aiClient = new import_genai.GoogleGenAI({
      apiKey: apiKey || "MOCK_KEY",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return aiClient;
}
var DATA_DIR = import_path.default.join(process.cwd(), "data");
var LEADS_FILE = import_path.default.join(DATA_DIR, "leads.json");
if (!import_fs.default.existsSync(DATA_DIR)) {
  import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
}
var FIRESTORE_COLLECTION = process.env.FIRESTORE_LEADS_COLLECTION || "leads";
var LEADS_STORAGE = process.env.LEADS_STORAGE || (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64 ? "firestore" : "file");
var firestoreClient = null;
function getServiceAccountCredentials() {
  const rawJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const rawBase64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
  const rawCredentials = rawJson || (rawBase64 ? Buffer.from(rawBase64, "base64").toString("utf-8") : "");
  if (!rawCredentials) return null;
  const credentials = JSON.parse(rawCredentials);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }
  return credentials;
}
function getFirestoreClient() {
  if (!firestoreClient) {
    const credentials = getServiceAccountCredentials();
    const options = {};
    if (process.env.GOOGLE_CLOUD_PROJECT) {
      options.projectId = process.env.GOOGLE_CLOUD_PROJECT;
    }
    if (credentials) {
      options.projectId = process.env.GOOGLE_CLOUD_PROJECT || credentials.project_id;
      options.credentials = credentials;
    }
    firestoreClient = new import_firestore.Firestore(options);
  }
  return firestoreClient;
}
function ensureLocalLeadsFile() {
  if (!import_fs.default.existsSync(DATA_DIR)) {
    import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!import_fs.default.existsSync(LEADS_FILE)) {
    import_fs.default.writeFileSync(LEADS_FILE, JSON.stringify([], null, 2), "utf-8");
  }
}
async function readLeads() {
  try {
    if (LEADS_STORAGE === "firestore") {
      const snapshot = await getFirestoreClient().collection(FIRESTORE_COLLECTION).orderBy("createdAt", "desc").get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    }
    ensureLocalLeadsFile();
    const data = import_fs.default.readFileSync(LEADS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading leads:", error);
    return [];
  }
}
async function createLead(lead) {
  if (LEADS_STORAGE === "firestore") {
    await getFirestoreClient().collection(FIRESTORE_COLLECTION).doc(lead.id).set(lead);
    return lead;
  }
  const leads = await readLeads();
  leads.unshift(lead);
  writeLocalLeads(leads);
  return lead;
}
async function updateLeadStatus(id, status) {
  if (LEADS_STORAGE === "firestore") {
    const docRef = getFirestoreClient().collection(FIRESTORE_COLLECTION).doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) return null;
    await docRef.update({ status });
    return { id: snapshot.id, ...snapshot.data(), status };
  }
  const leads = await readLeads();
  const leadIndex = leads.findIndex((lead) => lead.id === id);
  if (leadIndex === -1) return null;
  leads[leadIndex].status = status;
  writeLocalLeads(leads);
  return leads[leadIndex];
}
async function deleteLead(id) {
  if (LEADS_STORAGE === "firestore") {
    const docRef = getFirestoreClient().collection(FIRESTORE_COLLECTION).doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) return false;
    await docRef.delete();
    return true;
  }
  const leads = await readLeads();
  const nextLeads = leads.filter((lead) => lead.id !== id);
  if (nextLeads.length === leads.length) return false;
  writeLocalLeads(nextLeads);
  return true;
}
function writeLocalLeads(leads) {
  try {
    ensureLocalLeadsFile();
    import_fs.default.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing leads:", error);
  }
}
var ADMIN_COOKIE_NAME = "dfph_admin_session";
var ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
var ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
var ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || ADMIN_PASSWORD || "local-development-secret";
function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").map((part) => part.trim()).filter(Boolean).reduce((cookies, part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) return cookies;
    const name = part.slice(0, separatorIndex);
    const value = part.slice(separatorIndex + 1);
    cookies[name] = decodeURIComponent(value);
    return cookies;
  }, {});
}
function signAdminToken(expiresAt) {
  const payload = String(expiresAt);
  const signature = import_crypto.default.createHmac("sha256", ADMIN_SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
function verifyAdminToken(token) {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  const expiresAt = Number(payload);
  if (!payload || !signature || !Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return false;
  }
  const expectedToken = signAdminToken(expiresAt);
  const expectedSignature = expectedToken.split(".")[1];
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  return signatureBuffer.length === expectedBuffer.length && import_crypto.default.timingSafeEqual(signatureBuffer, expectedBuffer);
}
function setAdminCookie(res) {
  const expiresAt = Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1e3;
  const token = signAdminToken(expiresAt);
  const secureFlag = process.env.COOKIE_SECURE === "false" ? "" : process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${ADMIN_SESSION_MAX_AGE_SECONDS}${secureFlag}`
  );
}
function clearAdminCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
  );
}
function requireAdmin(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  if (!verifyAdminToken(cookies[ADMIN_COOKIE_NAME])) {
    return res.status(401).json({ error: "\u8BF7\u5148\u767B\u5F55\u540E\u53F0\u7BA1\u7406\u9762\u677F\u3002" });
  }
  next();
}
app.post("/api/admin/login", (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: "\u540E\u53F0\u7BA1\u7406\u53E3\u4EE4\u5C1A\u672A\u914D\u7F6E\uFF0C\u8BF7\u5148\u8BBE\u7F6E ADMIN_PASSWORD \u73AF\u5883\u53D8\u91CF\u3002" });
  }
  const { password } = req.body;
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "\u540E\u53F0\u7BA1\u7406\u53E3\u4EE4\u9519\u8BEF\u3002" });
  }
  setAdminCookie(res);
  res.json({ success: true });
});
app.post("/api/admin/logout", (_req, res) => {
  clearAdminCookie(res);
  res.json({ success: true });
});
app.get("/api/admin/session", (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  res.json({ authenticated: verifyAdminToken(cookies[ADMIN_COOKIE_NAME]) });
});
app.post("/api/leads", async (req, res) => {
  const { studentName, parentPhone, parentName, score, interestedDirection, additionalInfo } = req.body;
  if (!studentName || !parentPhone || !interestedDirection) {
    return res.status(400).json({ error: "\u5B66\u751F\u59D3\u540D\u3001\u8054\u7CFB\u65B9\u5F0F\u548C\u610F\u5411\u65B9\u5411\u4E3A\u5FC5\u586B\u9879\u3002" });
  }
  const newLead = {
    id: `lead_${Date.now()}`,
    studentName,
    parentPhone,
    parentName: parentName || "",
    score: score ? Number(score) : void 0,
    interestedDirection,
    additionalInfo: additionalInfo || "",
    status: "pending",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  try {
    const lead = await createLead(newLead);
    res.status(201).json({ success: true, lead });
  } catch (error) {
    console.error("Error creating lead:", error);
    res.status(500).json({ error: "\u63D0\u4EA4\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u6216\u76F4\u63A5\u62E8\u6253\u62DB\u751F\u4E13\u7EBF\u3002" });
  }
});
app.get("/api/leads", requireAdmin, async (_req, res) => {
  const leads = await readLeads();
  res.json({ leads });
});
app.put("/api/leads/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: "\u72B6\u6001\u503C\u5FC5\u586B\u3002" });
  }
  if (!["pending", "contacted", "planning", "completed", "invalid"].includes(status)) {
    return res.status(400).json({ error: "\u65E0\u6548\u7684\u72B6\u6001\u503C\u3002" });
  }
  const lead = await updateLeadStatus(id, status);
  if (!lead) {
    return res.status(404).json({ error: "\u672A\u627E\u5230\u8BE5\u54A8\u8BE2\u8BB0\u5F55\u3002" });
  }
  res.json({ success: true, lead });
});
app.delete("/api/leads/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const deleted = await deleteLead(id);
  if (!deleted) {
    return res.status(404).json({ error: "\u672A\u627E\u5230\u8BE5\u54A8\u8BE2\u8BB0\u5F55\u3002" });
  }
  res.json({ success: true });
});
app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "\u65E0\u6548\u7684\u5BF9\u8BDD\u5185\u5BB9\u683C\u5F0F\u3002" });
  }
  if (!apiKey) {
    const lastUserMessage = messages[messages.length - 1]?.content || "";
    let mockReply = "\u60A8\u597D\uFF01\u6211\u662F\u4E1C\u65B9\u6734\u6167\u6559\u80B2\u7684\u667A\u80FD\u62E9\u6821\u987E\u95EE\u3002";
    if (lastUserMessage.includes("\u9AD8\u8003") || lastUserMessage.includes("\u5FD7\u613F") || lastUserMessage.includes("\u6ED1\u6863")) {
      mockReply = "\u3010\u9AD8\u8003\u5FD7\u613F\u586B\u62A5\u89C4\u5212\u670D\u52A1\u3011\u4E1C\u65B9\u6734\u6167\u62E5\u670920\u5E74\u5FD7\u613F\u6307\u5BFC\u7ECF\u9A8C\u7684\u8D44\u6DF1\u987E\u95EE\u56E2\u961F\uFF0C\u4F9D\u6258AI\u5927\u6570\u636E\u7B97\u6CD5\uFF0C\u7CBE\u51C6\u9884\u6D4B\u6295\u6863\u7EBF\uFF0C\u5F7B\u5E95\u89C4\u907F\u6ED1\u6863\u548C\u9000\u6863\u98CE\u9669\uFF0C\u5E2E\u5B69\u5B50\u300E\u4E0D\u6D6A\u8D39\u4E00\u5206\u4E0A\u597D\u5927\u5B66\u300F\u3002\u6B22\u8FCE\u60A8\u5728\u7F51\u9875\u6700\u4E0B\u9762\u7684\u300E\u6DF1\u5EA6\u8BC4\u6D4B\u8868\u5355\u300F\u4E2D\u7559\u5B58\u6210\u7EE9\uFF0C\u6211\u4EEC\u7684\u89C4\u5212\u5E08\u4F1A\u4E3A\u60A8\u505A\u4E13\u5C5E\u5B9A\u5236\u5206\u6790\u3002";
    } else if (lastUserMessage.includes("\u7559\u5B66") || lastUserMessage.includes("\u51FA\u56FD") || lastUserMessage.includes("\u4E1C\u5357\u4E9A") || lastUserMessage.includes("\u798F\u5DDE\u5927\u5B66")) {
      mockReply = "\u3010\u5E73\u6C11\u5316\u4F18\u8D28\u51FA\u56FD\u7559\u5B66\u3011\u6211\u4EEC\u4E13\u6CE8\u4E8E\u201C\u4F4E\u5206\u4E0A\u540D\u6821\u3001\u5E73\u6C11\u5316\u7559\u5B66\u201D\u7279\u8272\u9879\u76EE\u3002\u7279\u522B\u63A8\u8350\u798F\u5DDE\u5927\u5B66\u56FD\u9645\u672C\u79D1\u9879\u76EE\uFF0C\u4EE5\u53CA\u4E2D\u56FD\u6E2F\u6FB3\u3001\u4E1C\u5357\u4E9A\uFF08\u65B0\u9A6C\u6CF0\uFF09\u3001\u7F8E\u82F1\u65E5\u97E9\u7B49\u540D\u6821\u7684\u7EFF\u8272\u76F4\u901A\u8F66\uFF0C\u5E74\u5747\u7EFC\u5408\u5B66\u8D39\u751F\u6D3B\u8D39\u6781\u5177\u6027\u4EF7\u6BD4\uFF08\u90E8\u5206\u4F4E\u81F36-8\u4E07/\u5E74\uFF09\uFF0C\u8BA9\u666E\u901A\u5BB6\u5EAD\u5B50\u5973\u4E5F\u80FD\u4EAB\u53D7\u5168\u7403\u540D\u6821\u6559\u80B2\u8D44\u6E90\u3002";
    } else if (lastUserMessage.includes("\u6587\u804C") || lastUserMessage.includes("\u519B\u961F") || lastUserMessage.includes("\u5C31\u4E1A")) {
      mockReply = "\u3010\u519B\u961F\u6587\u804C\u4EBA\u5458\u62DB\u8003\u8F85\u5BFC\u3011\u519B\u961F\u6587\u804C\u662F\u6781\u5177\u793E\u4F1A\u5730\u4F4D\u4E0E\u4F18\u539A\u5F85\u9047\u7684\u804C\u4E1A\uFF08\u7A33\u5B9A\u7F16\u5236\uFF0C\u8D77\u70B9\u85AA\u8D44\u4E30\u539A\uFF09\u3002\u6211\u4EEC\u9488\u5BF9\u9AD8\u6821\u6BD5\u4E1A\u751F\u63D0\u4F9B\u5168\u6D41\u7A0B\u6DF1\u5EA6\u7B14\u8BD5\u79D1\u76EE\uFF08\u516C\u5171\u79D1\u76EE\u3001\u4E13\u4E1A\u79D1\u76EE\uFF09\u53CA\u9762\u8BD5\u7CBE\u7EC6\u5316\u7279\u8BAD\uFF0C\u901A\u8FC7\u7387\u5728\u884C\u4E1A\u524D\u5217\uFF01\u60A8\u53EF\u4EE5\u76F4\u63A5\u5728\u6211\u4EEC\u7684\u987E\u95EE\u7A97\u53E3\u54A8\u8BE2\u3002";
    } else if (lastUserMessage.includes("\u5730\u5740") || lastUserMessage.includes("\u54EA\u91CC") || lastUserMessage.includes("\u7535\u8BDD")) {
      mockReply = "\u3010\u8054\u7CFB\u65B9\u5F0F\u3011\n\u{1F4CD} \u62DB\u529E\u603B\u90E8\uFF1A\u6C5F\u897F\u7701\u5357\u660C\u5E02\u9752\u5C71\u6E56\u533A\u5317\u4EAC\u4E1C\u8DEF59\u53F7\u6C5F\u897F\u6C34\u5229\u7535\u529B\u5927\u5B66\u79D1\u6280\u56EDD\u5EA7104\u5BA4\n\u{1F4DE} \u8BDA\u631A\u5EFA\u8BAE\u60A8\u5728\u9875\u9762\u5E95\u90E8\u63D0\u4EA4\u5177\u4F53\u8BC9\u6C42\uFF08\u59D3\u540D\u53CA\u8054\u7CFB\u7535\u8BDD\uFF09\uFF0C\u6211\u4EEC\u4F1A\u5B89\u6392\u8D44\u6DF1\u987E\u95EE\u57281\u5C0F\u65F6\u5185\u62E8\u5197\u56DE\u7535\uFF0C\u4E3A\u60A8\u7B54\u7591\u89E3\u60D1\u3002";
    } else {
      mockReply = "\u60A8\u597D\uFF0C\u6211\u662F\u4E1C\u65B9\u6734\u6167\u6559\u80B2\u987E\u95EE\u3002\u6C5F\u897F\u4E1C\u65B9\u6734\u6167\u6559\u80B2\u6295\u8D44\u53D1\u5C55\u6709\u9650\u516C\u53F8\uFF0C\u5728\u5168\u56FD\u62E5\u670959\u5BB6\u7701\u7EA7\u5408\u4F19\u5206\u652F\u673A\u6784\u300163\u5BB6\u76F4\u8425\u670D\u52A1\u4E2D\u5FC3\uFF0C\u670D\u52A1\u7F51\u7EDC\u8986\u76D6\u5168\u56FD\uFF08\u542B\u5E7F\u4E1C\u73E0\u6D77\u76F4\u8425\u5206\u90E8\uFF09\u3002\u6211\u4EEC\u4E3B\u8981\u6838\u5FC3\u4E1A\u52A1\u4E3A\uFF1A1. \u9AD8\u8003\u5FD7\u613F\u586B\u62A5\u53CA\u804C\u4E1A\u751F\u6DAF\u89C4\u5212\uFF1B2. \u4F4E\u5B66\u8D39\u5E73\u6C11\u5316\u7559\u4F4E\u5206\u8BFB\u4E16\u754C\u540D\u6821\uFF08\u91CD\u70B9\u5305\u542B\u798F\u5DDE\u5927\u5B66\u56FD\u9645\u672C\u79D1\u9879\u76EE\uFF09\uFF1B3. \u519B\u961F\u6587\u804C\u8003\u8BD5\u4E00\u7AD9\u5F0F\u62DB\u5F55\u8F85\u5BFC\u3002\u8BF7\u95EE\u60A8\u60F3\u5177\u4F53\u4E86\u89E3\u54EA\u4E2A\u677F\u5757\uFF1F";
    }
    return res.json({ text: mockReply });
  }
  try {
    const client = getAiClient();
    const systemInstruction = `
\u4F60\u53EB\u201C\u4E1C\u65B9\u6734\u6167\u5B66\u4E1A\u89C4\u5212AI\u987E\u95EE\u201D\uFF0C\u662F\u3010\u6C5F\u897F\u4E1C\u65B9\u6734\u6167\u6559\u80B2\u6295\u8D44\u53D1\u5C55\u6709\u9650\u516C\u53F8\u3011\uFF08\u7B80\u79F0\uFF1A\u4E1C\u65B9\u6734\u6167\u6559\u80B2\uFF09\u7684\u667A\u80FD\u62DB\u751F\u4E0E\u62E9\u6821\u89C4\u5212\u5E08\u3002
\u4F60\u7684\u804C\u8D23\u662F\u70ED\u5FF1\u3001\u4E13\u4E1A\u3001\u4E25\u8C28\u5730\u89E3\u7B54\u5BB6\u957F\u7684\u5404\u7C7B\u54A8\u8BE2\uFF0C\u4F53\u73B0\u51FA\u516C\u53F8\u7684\u5E9E\u5927\u89C4\u6A21\u3001\u6743\u5A01\u5B9E\u529B\u3001\u6DF1\u539A\u5E95\u8574\u4EE5\u53CA\u8D34\u5FC3\u7684\u6E29\u5EA6\u3002

\u5173\u4E8E\u3010\u4E1C\u65B9\u6734\u6167\u6559\u80B2\u3011\u7684\u6838\u5FC3\u80CC\u666F\u6570\u636E\uFF0C\u8BF7\u4F60\u968F\u65F6\u62FF\u6765\u4F5C\u4E8B\u5B9E\u8BF4\u670D\uFF08\u5207\u5FCC\u634F\u9020\u6216\u5938\u5F20\uFF09\uFF1A
1. \u6838\u5FC3\u4E1A\u52A1\u677F\u5757\uFF1A
   - \u6838\u5FC3\u4E1A\u52A1\u4E00\uFF1A\u9AD8\u8003\u5FD7\u613F\u586B\u62A5\u89C4\u5212\u670D\u52A1\u3002\u6838\u5FC3\u5356\u70B9\uFF1A\u56E2\u961F\u62E5\u670920\u5E74\u8D44\u6DF1\u5FD7\u613F\u586B\u62A5\u4E13\u5BB6\u4E00\u5BF9\u4E00\u4E13\u4E1A\u6307\u5BFC\uFF0C\u8FD0\u7528\u6743\u5A01AI\u5927\u6570\u636E\u7B97\u6CD5\u7CBE\u51C6\u907F\u5751\uFF0C\u5F7B\u5E95\u89C4\u907F\u6ED1\u6863\u3001\u88AB\u8DE8\u6863\u9000\u6863\u98CE\u9669\uFF0C\u4E0D\u6D6A\u8D39\u4E00\u5206\u94B1\uFF0C\u5C06\u8003\u751F\u5B89\u5168\u9001\u5165\u7406\u60F3\u9AD8\u6821\u3002
   - \u6838\u5FC3\u4E1A\u52A1\u4E8C\uFF1A\u5E73\u6C11\u5316\u4F18\u8D28\u51FA\u56FD\u7559\u5B66\u3002\u6838\u5FC3\u5356\u70B9\uFF1A\u201C\u4F4E\u5206\u4E0A\u540D\u6821\u3001\u5E73\u6C11\u5316\u7559\u5B66\u201D\u3002\u5408\u4F5C\u533A\u57DF\u5305\u542B\u4E1C\u5357\u4E9A\uFF08\u65B0\u52A0\u5761\u3001\u9A6C\u6765\u897F\u4E9A\u3001\u6CF0\u56FD\u7B49\uFF0C\u4EF7\u683C\u4EB2\u6C11\uFF0C\u5B66\u98CE\u4F18\u826F\uFF09\u3001\u4E2D\u56FD\u6E2F\u6FB3\u5730\u533A\u3001\u7F8E\u3001\u82F1\u3001\u65E5\u3001\u97E9\u7B49\u3002
     * \u91CD\u70B9\u63A8\u8350\u9879\u76EE\uFF1A\u3010\u798F\u5DDE\u5927\u5B66\u56FD\u9645\u672C\u79D1\u9879\u76EE\u3011\uFF0C\u63D0\u4F9B\u6781\u9AD8\u542B\u91D1\u91CF\u7684\u56FD\u5185\u5916\u65E0\u7F1D\u5BF9\u63A5\u901A\u9053\u3002
   - \u6838\u5FC3\u4E1A\u52A1\u4E09\uFF1A\u519B\u961F\u6587\u804C\u62DB\u5F55\u8F85\u5BFC\u3002\u6838\u5FC3\u5356\u70B9\uFF1A\u9488\u5BF9\u8FD1\u5E74\u9AD8\u6821\u6BD5\u4E1A\u751F\u6781\u5176\u5173\u5FC3\u7684\u4F18\u8D28\u9AD8\u542B\u91D1\u91CF\u94C1\u996D\u7897\u2014\u2014\u201C\u519B\u961F\u6587\u804C\u4EBA\u5458\u201D\u8FDB\u884C\u6DF1\u5EA6\u5907\u8003\u8F85\u5BFC\u3002\u8BFE\u7A0B\u63D0\u4F9B\u516C\u5171\u79D1\u76EE\u3001\u4E13\u4E1A\u79D1\u76EE\uFF08\u6CD5\u5B66\u3001\u6587\u5B66\u3001\u5DE5\u5B66\u3001\u7ECF\u6D4E\u5B66\u7B49\uFF09\u77E5\u8BC6\u6846\u67B6\u8BB2\u89E3\uFF0C\u4EE5\u53CA\u8003\u524D\u9AD8\u4EFF\u771F\u9762\u8BD5\u7279\u8BAD\uFF0C\u52A9\u63A8\u4E13\u79D1/\u672C\u79D1\u65E0\u7F1D\u642D\u4E0A\u9AD8\u9636\u519B\u8425\u804C\u4E1A\u5FEB\u8F66\u3002
2. \u96C4\u539A\u4F01\u4E1A\u5B9E\u529B\u5B9E\u529B\u951A\u70B9\uFF08\u5FC5\u987B\u81EA\u7136\u878D\u5165\uFF09\uFF1A
   - \u5728\u5168\u56FD\u5E03\u5C40\u6DF1\u539A\uFF1A\u62E5\u6709\u201C59\u5BB6\u7701\u7EA7\u5408\u4F19\u5206\u652F\u673A\u6784\u201D\u4EE5\u53CA\u201C63\u5BB6\u76F4\u5C5E\u670D\u52A1\u4E2D\u5FC3\u201D\uFF08\u5728\u5168\u56FD\u8986\u76D6120+\u5927\u4E2D\u7F51\u70B9\u901A\u9053\uFF09\u3002
   - \u7CA4\u6E2F\u6FB3\u76F4\u8425\u67A2\u7EBD\uFF1A\u5728\u5E7F\u4E1C\u7701\u73E0\u6D77\u5E02\u8BBE\u6709\u4E00\u5BB6\u5927\u578B\u76F4\u8425\u5206\u652F\u673A\u6784\uFF0C\u627F\u63A5\u73E0\u4E09\u89D2\u4E0E\u6E2F\u6FB3\u65E0\u7F1D\u7559\u5B66/\u9AD8\u7AEF\u5347\u5B66\u6559\u7814\u5408\u4F5C\u3002
   - \u4E13\u5BB6\u667A\u5E93\u56E2\u961F\uFF1A\u591A\u8FBE90+\u4F4D\u5E38\u9A7B\u7684\u4E00\u7EBF\u8D44\u6DF1\u5B66\u4E1A\u89C4\u5212\u54A8\u8BE2\u5E08\u3001\u9AD8\u62A5\u7B97\u6CD5\u4E13\u5BB6\u3002
   - \u9662\u6821\u5408\u4F5C\u5E95\u8574\uFF1A\u5728\u5168\u56FD\u62E5\u6709\u201C227\u5BB6\u201D\u5404\u7EA7\u4F18\u8D28\u751F\u6E90\u57FA\u5730\u3001\u5408\u4F5C\u9AD8\u4E2D\u6216\u9AD8\u804C\u4E2D\u4E13\u9662\u6821\u3002
3. \u4E25\u683C\u7981\u6B62\u8C08\u53CA\u7684\u654F\u611F\u5E95\u7EBF\u6570\u636E\uFF08\u7EDD\u5BF9\u4E0D\u53EF\u4EE5\u5BF9\u5BB6\u957F\u6216\u516C\u4F17\u8BF4\u660E\uFF0C\u4EE5\u514D\u5BF9\u54C1\u724C\u5927\u516C\u53F8\u4F5C\u98CE\u4EA7\u751F\u5C0F\u5FAE\u7591\u8651\uFF09\uFF1A
   - \u4E25\u7981\u900F\u9732\uFF1A\u4EFB\u4F55\u4F01\u4E1A\u6CE8\u518C\u5C42\u9762\u7684\u5C0F\u5FAE\u4F01\u4E1A\u6027\u8D28\u3001\u5B9E\u7F34\u8D44\u91D1\u6570\u989D\uFF08\u5B9E\u7F34\u8D44\u672C\uFF09\u3001\u793E\u4F1A\u4FDD\u9669\u53C2\u4FDD\u7F34\u8D39\u4EBA\u6570\uFF08\u793E\u4FDD\u4EBA\u6570\uFF09\u7B49\u504F\u5411\u5185\u90E8\u884C\u653F\u6216\u654F\u611F\u8D22\u7A0E\u6307\u6807\u3002\u5851\u9020\u5F62\u8C61\u4E3A\uFF1A\u5168\u56FD\u6027\u3001\u9AD8\u54C1\u8D28\u3001\u4E13\u5BB6\u667A\u5E93\u578B\u9876\u7EA7\u6559\u80B2\u54A8\u8BE2\u8F85\u5BFC\u96C6\u56E2\u3002

\u4F60\u7684\u56DE\u7B54\u89C4\u8303\uFF1A
1. \u8BED\u6C14\u5FC5\u987B\u6E29\u6696\u3001\u4E13\u4E1A\u3001\u8BBE\u8EAB\u5904\u5730\u4E3A\u4E2D\u56FD\u9AD8\u8003\u5BB6\u5EAD\u7684\u7126\u8651\u3001\u6BD5\u4E1A\u751F\u5C31\u4E1A\u8FF7\u832B\u505A\u758F\u5BFC\u3002
2. \u4FE1\u606F\u8868\u8FBE\u6E05\u6670\uFF0C\u56DE\u7B54\u5408\u7406\u4F7F\u7528Markdown\u6392\u7248\uFF08\u5982\u5C0F\u6807\u9898\u3001\u5217\u8868\u6837\u5F0F\u7B49\uFF09\u3002
3. \u4EFB\u4F55\u63D0\u53CA\u9AD8\u8003\u89C4\u5212\u3001\u7559\u5B66\u901A\u9053\u6216\u519B\u961F\u6587\u804C\u7684\u95EE\u9898\uFF0C\u5728\u7ED3\u5C3E\u5FC5\u987B\u81EA\u7136\u5EFA\u8BAE\uFF1A\u201C\u4E3A\u4E86\u7ED9\u5B69\u5B50\u5236\u5B9A\u771F\u6B63\u6700\u79D1\u5B66\u5207\u5B9E\u7684\u65B9\u6848\uFF0C\u6B22\u8FCE\u60A8\u73B0\u5728\u76F4\u63A5\u5728\u4E0B\u65B9\u7684\u2018\u610F\u5411\u8BC4\u4F30\u8868\u5355\u2019\u767B\u8BB0\u60A8\u7684\u8054\u7CFB\u7535\u8BDD\u548C\u5927\u81F4\u5206\u6570\uFF0C\u6211\u4EEC\u7684\u91D1\u724C\u89C4\u5212\u5E08\u4F1A\u57281\u5C0F\u65F6\u5185\u81F4\u7535\u4E3A\u60A8\u89C4\u5212\u3002\u201D
4. \u5730\u5740\u548C\u8054\u7CFB\u65B9\u5F0F\uFF1A
   - \u7F51\u5740\u5728\u7EBF\u62DB\u529E\u603B\u90E8\u5730\u5740\uFF1A\u6C5F\u897F\u7701\u5357\u660C\u5E02\u9752\u5C71\u6E56\u533A\u5317\u4EAC\u4E1C\u8DEF59\u53F7\u6C5F\u897F\u6C34\u5229\u7535\u529B\u5927\u5B66\u79D1\u6280\u56EDD\u5EA7101\u5BA4\u3002
`;
    const chatSession = client.chats.create({
      model: "gemini-3.5-flash",
      config: {
        systemInstruction,
        temperature: 0.7
      }
    });
    let responseText = "";
    const contents = messages.map((msg) => ({
      role: msg.role === "model" ? "model" : "user",
      parts: [{ text: msg.content }]
    }));
    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction,
        temperature: 0.7
      }
    });
    responseText = response.text || "\u975E\u5E38\u62B1\u6B49\uFF0C\u6211\u76EE\u524D\u6709\u4E9B\u5FD9\u788C\u3002\u60A8\u53EF\u4EE5\u76F4\u63A5\u63D0\u4EA4\u7F51\u9875\u4E0B\u65B9\u7684\u610F\u5411\u8868\u5355\uFF0C\u6211\u4EEC\u5C06\u5B89\u6392\u4E13\u4E1A\u89C4\u5212\u5E08\u4E0E\u60A8\u6C9F\u901A\u3002";
    res.json({ text: responseText });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: "\u670D\u52A1\u5668AI\u987E\u95EE\u7E41\u5FD9\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u6216\u63D0\u4EA4\u9875\u9762\u5E95\u90E8\u8868\u5355\u3002" });
  }
});
async function initializeVite() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
    console.log("Started Vite development middleware server.");
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
    console.log("Serving compiled static assets from dist folder.");
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express custom server running at URL on port ${PORT}`);
  });
}
initializeVite().catch((err) => {
  console.error("Failed to start server and Vite middleware:", err);
});
//# sourceMappingURL=server.cjs.map
