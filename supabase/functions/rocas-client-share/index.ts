// Secure quote sharing and messaging for the ROCAS owner and clients.
// Required function environment: SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY. Never put the service-role key in browser code.
// Configure this function with verify_jwt=false; this handler verifies owner JWTs
// itself and permits anonymous quote access only with an unguessable share token.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGIN = "https://raancasguer1.github.io";
const MAX_BODY_BYTES = 160_000;
const MAX_ITEMS = 200;
const SHARE_DAYS = 30;
const MAX_PUBLIC_RESPONSES_PER_HOUR = 10;
const MAX_PUBLIC_MESSAGES_PER_HOUR = 30;
const MAX_THREAD_MESSAGES = 200;
const DRAFT_FIELDS = [
  "clientName", "clientId", "clientAddress", "clientPhone", "clientEmail", "clientRepresentative",
  "rocasName", "rocasId", "rocasAddress", "rocasContact", "advanceAmount", "advanceCondition",
  "milestoneAmount", "milestoneCondition", "balanceAmount", "balanceCondition", "startCondition",
  "deliveryDate", "duration", "taxes", "clientSupplies", "rocasSupplies", "exclusions",
  "siteConditions", "inspection", "supports", "warranty", "reportIssue", "pauseTermination",
  "communications", "signatureCityDate", "signers",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function badRequest(): Response { return json({ error: "No se pudo procesar la solicitud." }, 400); }
function unavailable(): Response { return json({ error: "El servicio de cotizaciones no está disponible." }, 503); }

function str(value: unknown, max: number, required = false): string {
  if (typeof value !== "string") return "";
  const s = value.trim().slice(0, max);
  return required && !s ? "" : s;
}

function nonNegative(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000_000 ? n : null;
}

function bearer(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return null;
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

async function userFromRequest(req: Request): Promise<{ id: string; email: string } | null> {
  const jwt = bearer(req);
  if (!jwt || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!r.ok) return null;
  const user = await r.json().catch(() => null);
  if (!user || typeof user.id !== "string") return null;
  return { id: user.id, email: typeof user.email === "string" ? user.email : "" };
}

function serviceHeaders(extra: Record<string, string> = {}): Headers {
  const h = new Headers({
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  });
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return h;
}

async function db(path: string, init: RequestInit = {}): Promise<unknown> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("service_unconfigured");
  const headers = serviceHeaders();
  new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  const text = await r.text();
  let data: unknown = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!r.ok) throw new Error(`database_${r.status}`);
  return data;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

function sanitizeQuote(input: unknown): { snapshot: Record<string, unknown>; quoteNumber: string; revision: number; clientName: string } | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const q = input as Record<string, unknown>;
  const form = q.form && typeof q.form === "object" && !Array.isArray(q.form) ? q.form as Record<string, unknown> : {};
  const quoteNumber = str(q.number ?? form.quoteNo, 80, true);
  const revisionRaw = Number(q.revision ?? 1);
  const revision = Number.isInteger(revisionRaw) && revisionRaw > 0 ? revisionRaw : 1;
  const clientName = str(form.client, 200, true);
  const project = str(form.project, 300, true);
  const status = str(form.quoteStatus, 40);
  const sourceLines = Array.isArray(q.lines) ? q.lines : [];
  // Only authenticated ROCAS owners may create links for real quotes marked as sent.
  const realQuote = quoteNumber.startsWith("ROCAS-") && !quoteNumber.startsWith("ROCAS-DEMO-");
  if (!quoteNumber || !clientName || !project || status !== "Enviada" || sourceLines.length > MAX_ITEMS || !realQuote) return null;
  const items: Array<Record<string, unknown>> = [];
  let total = 0;
  for (const raw of sourceLines) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const line = raw as Record<string, unknown>;
    const qty = nonNegative(line.qty);
    const unitPrice = nonNegative(line.price);
    const name = str(line.name, 240, true);
    const unit = str(line.unit, 32, true);
    if (qty === null || unitPrice === null || !name || !unit || qty <= 0) return null;
    const lineTotal = Math.round(qty * unitPrice);
    total += lineTotal;
    if (!Number.isSafeInteger(total) || total > 1_000_000_000_000) return null;
    items.push({
      code: str(line.code, 40),
      name,
      unit,
      quantity: qty,
      unitPrice,
      lineTotal,
    });
  }
  if (!items.length) return null;
  const snapshot = {
    quoteNumber,
    revision,
    documentType: str(form.quoteType, 40) || "Cotización",
    parentQuote: str(form.parentQuote, 80),
    date: str(form.date, 20),
    clientName,
    project,
    workLocation: str(form.location, 300),
    scopeNotes: str(form.notes, 3000),
    items,
    laborTotal: total,
    notice: "Presupuesto de mano de obra. No incluye materiales, equipos, transporte, disposición de escombros, AIU, impuestos ni otros costos, salvo que estén indicados expresamente en la cotización.",
  };
  return { snapshot, quoteNumber, revision, clientName };
}

async function findActiveShare(token: string): Promise<Record<string, unknown> | null> {
  if (token.length < 40 || token.length > 60) return null;
  const digest = await hashToken(token);
  const params = new URLSearchParams({
    select: "id,quote_number,quote_revision,client_name,snapshot,expires_at,revoked_at",
    token_hash: `eq.${digest}`,
    revoked_at: "is.null",
    deleted_at: "is.null",
    quote_number: "not.like.ROCAS-DEMO-*",
    expires_at: `gt.${new Date().toISOString()}`,
    limit: "1",
  });
  const rows = await db(`rocas_quote_shares?${params.toString()}`) as Array<Record<string, unknown>>;
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function handleCreate(req: Request, body: Record<string, unknown>): Promise<Response> {
  const user = await userFromRequest(req);
  if (!user) return json({ error: "Inicia sesión en ROCAS para compartir la cotización." }, 401);
  const clean = sanitizeQuote(body.quote);
  if (!clean) return badRequest();
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SHARE_DAYS * 24 * 60 * 60 * 1000);
  const inserted = await db("rocas_quote_shares?select=id,quote_number,quote_revision,client_name,created_at,expires_at", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: user.id,
      quote_number: clean.quoteNumber,
      quote_revision: clean.revision,
      client_name: clean.clientName,
      token_hash: tokenHash,
      snapshot: clean.snapshot,
      created_at: createdAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    }),
  }) as Array<Record<string, unknown>>;
  if (!Array.isArray(inserted) || !inserted.length) throw new Error("share_insert_failed");
  const share = inserted[0];
  // A new shared revision automatically revokes older links for this same quote only.
  const revokeParams = new URLSearchParams({
    user_id: `eq.${user.id}`,
    quote_number: `eq.${clean.quoteNumber}`,
    id: `neq.${String(share.id)}`,
    revoked_at: "is.null",
  });
  await db(`rocas_quote_shares?${revokeParams.toString()}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ revoked_at: createdAt.toISOString() }),
  });
  // Raw bearer token is returned only once to the authenticated owner; only its hash is stored.
  return json({ shareId: share.id, token, expiresAt: expiresAt.toISOString() }, 201);
}

async function handleView(body: Record<string, unknown>): Promise<Response> {
  const token = str(body.token, 60, true);
  if (!token) return badRequest();
  const share = await findActiveShare(token);
  if (!share) return json({ error: "Este enlace no está disponible o venció." }, 404);
  // Whitelisted copy only: never return owner id, token hash, contacts, internal costs, photos, or notes.
  return json({
    shareId: share.id,
    quote: share.snapshot,
    expiresAt: share.expires_at,
  });
}

async function handleResponse(body: Record<string, unknown>): Promise<Response> {
  const token = str(body.token, 60, true);
  const type = str(body.responseType, 32, true);
  const name = str(body.respondentName, 120, true);
  const message = str(body.message, 2000);
  if (!token || !["accepted", "change_request", "question", "rejected"].includes(type) || !name) return badRequest();
  if ((type === "change_request" || type === "question") && !message) return badRequest();
  const share = await findActiveShare(token);
  if (!share) return json({ error: "Este enlace no está disponible o venció." }, 404);
  const shareId = String(share.id);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentParams = new URLSearchParams({ share_id: `eq.${shareId}`, created_at: `gte.${since}`, select: "id", limit: String(MAX_PUBLIC_RESPONSES_PER_HOUR) });
  const recent = await db(`rocas_quote_responses?${recentParams.toString()}`) as unknown[];
  if (Array.isArray(recent) && recent.length >= MAX_PUBLIC_RESPONSES_PER_HOUR) return json({ error: "Se alcanzó el límite temporal de respuestas para este enlace." }, 429);
  if (type === "accepted") {
    const priorParams = new URLSearchParams({ share_id: `eq.${shareId}`, response_type: "eq.accepted", select: "id", limit: "1" });
    const prior = await db(`rocas_quote_responses?${priorParams.toString()}`) as unknown[];
    if (Array.isArray(prior) && prior.length) return json({ error: "La aceptación ya quedó registrada." }, 409);
  }
  const inserted = await db("rocas_quote_responses?select=id,response_type,respondent_name,message,created_at", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ share_id: shareId, response_type: type, respondent_name: name, message }),
  }) as Array<Record<string, unknown>>;
  if (!Array.isArray(inserted) || !inserted.length) throw new Error("response_insert_failed");
  return json({ received: true, response: inserted[0] }, 201);
}

function cleanMessage(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: str(row.id, 36),
    share_id: str(row.share_id, 36),
    sender_type: row.sender_type === "owner" ? "owner" : "client",
    sender_name: str(row.sender_name, 120),
    message: str(row.message, 2000),
    created_at: str(row.created_at, 40),
  };
}

async function handleClientThread(body: Record<string, unknown>): Promise<Response> {
  const token = str(body.token, 60, true);
  if (!token) return badRequest();
  const share = await findActiveShare(token);
  if (!share) return json({ error: "Este enlace no está disponible o venció." }, 404);
  const shareId = String(share.id);
  const params = new URLSearchParams({
    share_id: `eq.${shareId}`,
    select: "id,share_id,sender_type,sender_name,message,created_at",
    deleted_at: "is.null",
    order: "created_at.asc",
    limit: String(MAX_THREAD_MESSAGES),
  });
  const rows = await db(`rocas_quote_messages?${params.toString()}`) as Array<Record<string, unknown>>;
  return json({ messages: Array.isArray(rows) ? rows.map(cleanMessage) : [] });
}

async function handleClientMessage(body: Record<string, unknown>): Promise<Response> {
  const token = str(body.token, 60, true);
  const nameRaw = typeof body.respondentName === "string" ? body.respondentName.trim() : "";
  const messageRaw = typeof body.message === "string" ? body.message.trim() : "";
  if (!token || !nameRaw || nameRaw.length > 120 || !messageRaw || messageRaw.length > 2000) return badRequest();
  const name = str(nameRaw, 120, true);
  const share = await findActiveShare(token);
  if (!share) return json({ error: "Este enlace no está disponible o venció." }, 404);
  const shareId = String(share.id);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentParams = new URLSearchParams({
    share_id: `eq.${shareId}`,
    sender_type: "eq.client",
    created_at: `gte.${since}`,
    select: "id",
    limit: String(MAX_PUBLIC_MESSAGES_PER_HOUR),
  });
  const recent = await db(`rocas_quote_messages?${recentParams.toString()}`) as unknown[];
  if (Array.isArray(recent) && recent.length >= MAX_PUBLIC_MESSAGES_PER_HOUR) {
    return json({ error: "Se alcanzó el límite temporal de mensajes para este enlace." }, 429);
  }
  const inserted = await db("rocas_quote_messages?select=id,share_id,sender_type,sender_name,message,created_at", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ share_id: shareId, sender_type: "client", sender_name: name, message: messageRaw }),
  }) as Array<Record<string, unknown>>;
  if (!Array.isArray(inserted) || !inserted.length) throw new Error("message_insert_failed");
  return json({ received: true, message: cleanMessage(inserted[0]) }, 201);
}

async function handleOwnerMessage(req: Request, body: Record<string, unknown>): Promise<Response> {
  const user = await userFromRequest(req);
  if (!user) return json({ error: "Inicia sesión en ROCAS para responder." }, 401);
  const shareId = str(body.shareId, 36, true);
  const messageRaw = typeof body.message === "string" ? body.message.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(shareId) || !messageRaw || messageRaw.length > 2000) return badRequest();
  const params = new URLSearchParams({
    id: `eq.${shareId}`,
    user_id: `eq.${user.id}`,
    deleted_at: "is.null",
    select: "id,expires_at,revoked_at",
    limit: "1",
  });
  const owned = await db(`rocas_quote_shares?${params.toString()}`) as Array<Record<string, unknown>>;
  const share = Array.isArray(owned) ? owned[0] : null;
  if (!share || share.revoked_at) {
    return json({ error: "Este enlace está cerrado y no admite nuevas respuestas." }, 409);
  }
  const expiry = Date.parse(String(share.expires_at));
  if (!Number.isFinite(expiry)) return json({ error: "No se pudo verificar la vigencia del enlace." }, 409);
  let renewedExpiry: string | null = null;
  if (expiry <= Date.now()) {
    renewedExpiry = new Date(Date.now() + SHARE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const renewParams = new URLSearchParams({ id: `eq.${shareId}`, user_id: `eq.${user.id}`, deleted_at: "is.null", revoked_at: "is.null", select: "id" });
    const renewed = await db(`rocas_quote_shares?${renewParams.toString()}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ expires_at: renewedExpiry }),
    }) as unknown[];
    if (!Array.isArray(renewed) || !renewed.length) return json({ error: "No se pudo reactivar el enlace para responder." }, 409);
  }
  const inserted = await db("rocas_quote_messages?select=id,share_id,sender_type,sender_name,message,created_at", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ share_id: shareId, sender_type: "owner", sender_name: "ROCAS", message: messageRaw }),
  }) as Array<Record<string, unknown>>;
  if (!Array.isArray(inserted) || !inserted.length) throw new Error("message_insert_failed");
  return json({ received: true, message: cleanMessage(inserted[0]), expiresAt: renewedExpiry }, 201);
}

async function handleOwnerList(req: Request): Promise<Response> {
  const user = await userFromRequest(req);
  if (!user) return json({ error: "Inicia sesión en ROCAS para ver las respuestas." }, 401);
  const params = new URLSearchParams({
    user_id: `eq.${user.id}`,
    deleted_at: "is.null",
    quote_number: "not.like.ROCAS-DEMO-*",
    select: "id,quote_number,quote_revision,client_name,created_at,expires_at,revoked_at,snapshot,deleted_at",
    order: "created_at.desc",
    limit: "100",
  });
  const shares = await db(`rocas_quote_shares?${params.toString()}`) as Array<Record<string, unknown>>;
  if (!Array.isArray(shares) || !shares.length) return json({ shares: [] });
  const ids = shares.map(s => String(s.id)).filter(id => /^[0-9a-f-]{36}$/i.test(id));
  const responseParams = new URLSearchParams({
    share_id: `in.(${ids.join(",")})`,
    select: "id,share_id,response_type,respondent_name,message,created_at",
    order: "created_at.desc",
    limit: "1000",
  });
  const responses = ids.length ? await db(`rocas_quote_responses?${responseParams.toString()}`) : [];
  const messageParams = new URLSearchParams({
    share_id: `in.(${ids.join(",")})`,
    select: "id,share_id,sender_type,sender_name,message,created_at",
    deleted_at: "is.null",
    order: "created_at.asc",
    limit: "1000",
  });
  const messages = ids.length ? await db(`rocas_quote_messages?${messageParams.toString()}`) : [];
  return json({ shares, responses, messages });
}

function sanitizeDraftData(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  if (Object.keys(source).some(key => !DRAFT_FIELDS.includes(key))) return null;
  const output: Record<string, string> = {};
  for (const field of DRAFT_FIELDS) {
    const value = source[field];
    if (typeof value !== "string" || value.length > 2000) return null;
    output[field] = value.trim();
  }
  return JSON.stringify(output).length <= 50_000 ? output : null;
}

async function findOwnedAcceptedDemoShare(userId: string, shareId: string): Promise<Record<string, unknown> | null> {
  const params = new URLSearchParams({
    id: `eq.${shareId}`,
    user_id: `eq.${userId}`,
    select: "id,user_id,quote_number,quote_revision,client_name,snapshot",
    limit: "1",
  });
  const rows = await db(`rocas_quote_shares?${params.toString()}`) as Array<Record<string, unknown>>;
  const share = Array.isArray(rows) ? rows[0] : null;
  if (!share) return null;
  const snapshot = share.snapshot && typeof share.snapshot === "object" && !Array.isArray(share.snapshot)
    ? share.snapshot as Record<string, unknown> : {};
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const demoOnly = String(share.quote_number || "").startsWith("ROCAS-DEMO-")
    && share.client_name === "Cliente de prueba · no real"
    && snapshot.project === "Prueba de enlace y respuesta"
    && items.length > 0
    && items.every(raw => raw && typeof raw === "object" && !Array.isArray(raw)
      && typeof (raw as Record<string, unknown>).code === "string"
      && ((raw as Record<string, unknown>).code as string).startsWith("DEMO-"));
  if (!demoOnly) return null;
  const acceptedParams = new URLSearchParams({ share_id: `eq.${shareId}`, response_type: "eq.accepted", select: "id", limit: "1" });
  const accepted = await db(`rocas_quote_responses?${acceptedParams.toString()}`) as unknown[];
  return Array.isArray(accepted) && accepted.length ? { ...share, snapshot } : null;
}

async function handleContractLoad(req: Request, body: Record<string, unknown>): Promise<Response> {
  const user = await userFromRequest(req);
  if (!user) return json({ error: "Inicia sesión en ROCAS para abrir este borrador." }, 401);
  const shareId = str(body.shareId, 36, true);
  if (!/^[0-9a-f-]{36}$/i.test(shareId)) return badRequest();
  const share = await findOwnedAcceptedDemoShare(user.id, shareId);
  if (!share) return json({ error: "Solo una cotización ficticia aceptada puede abrir este borrador de prueba." }, 404);
  const params = new URLSearchParams({ share_id: `eq.${shareId}`, user_id: `eq.${user.id}`, select: "draft_data,updated_at,status", limit: "1" });
  const rows = await db(`rocas_contract_drafts?${params.toString()}`) as Array<Record<string, unknown>>;
  const saved = Array.isArray(rows) ? rows[0] : null;
  const draftData = sanitizeDraftData(saved?.draft_data) ?? Object.fromEntries(DRAFT_FIELDS.map(field => [field, ""]));
  return json({ share: { id: share.id, quoteNumber: share.quote_number, revision: share.quote_revision, clientName: share.client_name, snapshot: share.snapshot }, draftData, updatedAt: saved?.updated_at ?? null, status: "BORRADOR" });
}

async function handleContractSave(req: Request, body: Record<string, unknown>): Promise<Response> {
  const user = await userFromRequest(req);
  if (!user) return json({ error: "Inicia sesión en ROCAS para guardar este borrador." }, 401);
  const shareId = str(body.shareId, 36, true);
  const draftData = sanitizeDraftData(body.draftData);
  if (!/^[0-9a-f-]{36}$/i.test(shareId) || !draftData) return badRequest();
  const share = await findOwnedAcceptedDemoShare(user.id, shareId);
  if (!share) return json({ error: "Solo una cotización ficticia aceptada puede guardar este borrador de prueba." }, 404);
  const now = new Date().toISOString();
  const params = new URLSearchParams({ on_conflict: "share_id", select: "share_id,updated_at,status" });
  const rows = await db(`rocas_contract_drafts?${params.toString()}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ share_id: shareId, user_id: user.id, quote_number: share.quote_number, quote_revision: share.quote_revision, draft_data: draftData, status: "BORRADOR", updated_at: now }),
  }) as Array<Record<string, unknown>>;
  if (!Array.isArray(rows) || !rows.length) throw new Error("contract_draft_save_failed");
  return json({ saved: true, status: "BORRADOR", updatedAt: rows[0].updated_at });
}

async function handleOwnerDeleteShare(req: Request, body: Record<string, unknown>): Promise<Response> {
  const user = await userFromRequest(req);
  if (!user) return json({ error: "Inicia sesión en ROCAS para eliminar esta cotización compartida." }, 401);
  const shareId = str(body.shareId, 36, true);
  if (!/^[0-9a-f-]{36}$/i.test(shareId)) return badRequest();
  const now = new Date().toISOString();
  const params = new URLSearchParams({ id: `eq.${shareId}`, user_id: `eq.${user.id}`, deleted_at: "is.null", select: "id" });
  const rows = await db(`rocas_quote_shares?${params.toString()}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ deleted_at: now, revoked_at: now }),
  }) as unknown[];
  if (!Array.isArray(rows) || !rows.length) return json({ error: "No se encontró esa cotización compartida en tu cuenta." }, 404);
  return json({ deleted: true, retainedForRecovery: true });
}

async function handleOwnerDeleteMessage(req: Request, body: Record<string, unknown>): Promise<Response> {
  const user = await userFromRequest(req);
  if (!user) return json({ error: "Inicia sesión en ROCAS para eliminar mensajes." }, 401);
  const shareId = str(body.shareId, 36, true);
  const messageId = str(body.messageId, 36, true);
  if (!/^[0-9a-f-]{36}$/i.test(shareId) || !/^[0-9a-f-]{36}$/i.test(messageId)) return badRequest();
  const ownedParams = new URLSearchParams({ id: `eq.${shareId}`, user_id: `eq.${user.id}`, deleted_at: "is.null", select: "id", limit: "1" });
  const owned = await db(`rocas_quote_shares?${ownedParams.toString()}`) as unknown[];
  if (!Array.isArray(owned) || !owned.length) return json({ error: "No se encontró esa cotización compartida en tu cuenta." }, 404);
  const messageParams = new URLSearchParams({ id: `eq.${messageId}`, share_id: `eq.${shareId}`, deleted_at: "is.null", select: "id" });
  const rows = await db(`rocas_quote_messages?${messageParams.toString()}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  }) as unknown[];
  if (!Array.isArray(rows) || !rows.length) return json({ error: "No se encontró ese mensaje para esta cotización." }, 404);
  return json({ deleted: true, retainedForRecovery: true });
}

async function handleRevoke(req: Request, body: Record<string, unknown>): Promise<Response> {
  const user = await userFromRequest(req);
  if (!user) return json({ error: "Inicia sesión en ROCAS para administrar el enlace." }, 401);
  const shareId = str(body.shareId, 36, true);
  if (!/^[0-9a-f-]{36}$/i.test(shareId)) return badRequest();
  const params = new URLSearchParams({ id: `eq.${shareId}`, user_id: `eq.${user.id}`, revoked_at: "is.null", select: "id" });
  const rows = await db(`rocas_quote_shares?${params.toString()}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  }) as unknown[];
  if (!Array.isArray(rows) || !rows.length) return json({ error: "No se encontró un enlace activo de tu cuenta." }, 404);
  return json({ revoked: true });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const origin = req.headers.get("origin");
  if (origin && origin !== ALLOWED_ORIGIN) return json({ error: "Origen no permitido." }, 403);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) return unavailable();
  try {
    if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
    const body = await readJson(req);
    if (!body) return badRequest();
    switch (body.action) {
      case "create": return await handleCreate(req, body);
      case "view": return await handleView(body);
      case "respond": return await handleResponse(body);
      case "client-thread": return await handleClientThread(body);
      case "client-message": return await handleClientMessage(body);
      case "owner-message": return await handleOwnerMessage(req, body);
      case "owner-list": return await handleOwnerList(req);
      case "delete-share": return await handleOwnerDeleteShare(req, body);
      case "delete-message": return await handleOwnerDeleteMessage(req, body);
      case "contract-load": return await handleContractLoad(req, body);
      case "contract-save": return await handleContractSave(req, body);
      case "revoke": return await handleRevoke(req, body);
      default: return badRequest();
    }
  } catch (error) {
    // Do not log request bodies, bearer tokens, or share links.
    console.error("rocas-client-share request failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "No se pudo completar la operación. Inténtalo más tarde." }, 500);
  }
});
