const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const compression = require('compression');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const uploadsDir = path.join(__dirname, 'uploads');
const reportsDir = path.join(__dirname, 'reports');
const MAX_EVIDENCE_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_EVIDENCE_FILES = 20;
const PLATFORM_FRAMEWORK = 'OCTAVE Allegro';

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cybersecurity_audit'
};

let db;

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan('dev'));
app.use(cors({
  origin: ['http://localhost:3001', 'http://127.0.0.1:3001'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use('/reports', express.static(reportsDir));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
  }),
  limits: {
    fileSize: MAX_EVIDENCE_FILE_SIZE_BYTES,
    files: MAX_EVIDENCE_FILES
  }
});

function evidenceUploadSingle(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: `File is too large. Maximum file size is ${Math.floor(MAX_EVIDENCE_FILE_SIZE_BYTES / (1024 * 1024))} MB` });
      }
      if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: `Maximum number of files reached (${MAX_EVIDENCE_FILES})` });
      }
    }
    return res.status(400).json({ error: error.message || 'File upload failed' });
  });
}

function evidenceUploadMultiple(req, res, next) {
  upload.array('files', MAX_EVIDENCE_FILES)(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: `File is too large. Maximum file size is ${Math.floor(MAX_EVIDENCE_FILE_SIZE_BYTES / (1024 * 1024))} MB` });
      }
      if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: `Too many files selected. Maximum number of files is ${MAX_EVIDENCE_FILES}` });
      }
    }
    return res.status(400).json({ error: error.message || 'File upload failed' });
  });
}

const LIKELIHOOD_MAP = { Low: 1, Medium: 2, High: 3, 'Very High': 4, Critical: 5 };
const IMPACT_MAP = { Low: 1, Medium: 2, High: 3, 'Very High': 4, Critical: 5 };

function numericLikelihood(value) {
  if (typeof value === 'number') return Math.max(1, Math.min(5, value));
  return LIKELIHOOD_MAP[value] || 2;
}

function numericImpact(value) {
  if (typeof value === 'number') return Math.max(1, Math.min(5, value));
  return IMPACT_MAP[value] || 2;
}

function riskLevelFromScore(score) {
  // Keep thresholds aligned with risk engine defaults:
  // Critical >= 12, High >= 8, Medium >= 4, else Low
  if (score >= 12) return 'Critical';
  if (score >= 8) return 'High';
  if (score >= 4) return 'Medium';
  return 'Low';
}

function calculateExposureLevel({ sector, employeeCount, environment }) {
  const sectorWeights = {
    'Financial Services': 5,
    Healthcare: 5,
    Government: 5,
    Energy: 4,
    Telecommunications: 4,
    Technology: 3,
    Manufacturing: 3,
    Retail: 2,
    Education: 2,
    Other: 2
  };

  let score = sectorWeights[sector] || 2;
  const size = Number(employeeCount || 0);
  if (size >= 5000) score += 5;
  else if (size >= 1000) score += 4;
  else if (size >= 250) score += 3;
  else if (size >= 50) score += 2;
  else score += 1;

  const env = String(environment || '').toLowerCase();
  if (env.includes('internet') || env.includes('public') || env.includes('web')) score += 4;
  if (env.includes('cloud')) score += 3;
  if (env.includes('hybrid')) score += 2;
  if (env.includes('internal')) score += 1;

  if (score >= 12) return 'Critical';
  if (score >= 9) return 'High';
  if (score >= 6) return 'Medium';
  return 'Low';
}

function calculateCriticalityScore({ confidentiality, integrity, availability, businessCriticality }) {
  const c = Number(confidentiality || 3);
  const i = Number(integrity || 3);
  const a = Number(availability || 3);
  const base = (c + i + a) / 3;
  const businessWeight = { Low: 0.8, Medium: 1, High: 1.2, Critical: 1.4 }[businessCriticality || 'Medium'];
  return Number((base * 20 * businessWeight).toFixed(2));
}

function criticalityFromScore(score) {
  const value = Number(score || 0);
  if (value >= 85) return 'Critical';
  if (value >= 70) return 'High';
  if (value >= 45) return 'Medium';
  return 'Low';
}

function toCompliancePercent(stats) {
  const total = Number(stats.total_controls || 0);
  if (!total) return 0;
  const compliant = Number(stats.compliant_controls || 0);
  return Number(((compliant / total) * 100).toFixed(2));
}

function sanitizeFilename(name) {
  return String(name || 'report').replace(/[^a-zA-Z0-9-_]/g, '_');
}

function normalizeContainerType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.startsWith('tech')) return 'Technical';
  if (raw.startsWith('phys')) return 'Physical';
  if (raw.startsWith('peop') || raw.startsWith('person')) return 'People';
  return null;
}

function isDbConnectionError(error) {
  const code = error?.code || '';
  const msg = String(error?.message || '').toLowerCase();
  return (
    code === 'PROTOCOL_CONNECTION_LOST' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    msg.includes('cannot enqueue') ||
    msg.includes('closed state') ||
    msg.includes('lost connection')
  );
}

async function reconnectDb() {
  try {
    if (db) await db.end();
  } catch (_e) {
    // ignore
  }
  db = await mysql.createConnection(dbConfig);
}

async function dbExecute(query, params = []) {
  try {
    return await db.execute(query, params);
  } catch (error) {
    if (isDbConnectionError(error)) {
      await reconnectDb();
      return db.execute(query, params);
    }
    throw error;
  }
}

const VULNERABILITY_RISK_MAPPING = {
  'SQL Injection': { likelihood: 4, impact: 5, business_impact: 'Database theft and unauthorized data modification.' },
  'Command Injection': { likelihood: 4, impact: 5, business_impact: 'Remote command execution on application server.' },
  'LDAP Injection': { likelihood: 3, impact: 4, business_impact: 'Unauthorized directory data access.' },
  'Weak Password Policy': { likelihood: 4, impact: 4, business_impact: 'Account takeover risk due to weak credentials.' },
  'No Account Lockout': { likelihood: 4, impact: 4, business_impact: 'Brute-force attack success probability increased.' },
  'Session Hijacking': { likelihood: 3, impact: 4, business_impact: 'Unauthorized session usage by attackers.' },
  'No HTTPS / TLS': { likelihood: 3, impact: 4, business_impact: 'Sensitive data interception during transit.' },
  'Weak Encryption': { likelihood: 3, impact: 4, business_impact: 'Data confidentiality compromise.' },
  'Exposed Database Backup': { likelihood: 4, impact: 5, business_impact: 'Bulk data leakage from backup storage.' },
  'IDOR (Insecure Direct Object Reference)': { likelihood: 4, impact: 4, business_impact: 'Unauthorized access to user records.' },
  'Privilege Escalation': { likelihood: 3, impact: 5, business_impact: 'Administrative takeover and full compromise.' },
  'Default Credentials': { likelihood: 5, impact: 5, business_impact: 'Immediate unauthorized access using known defaults.' },
  'Directory Listing Enabled': { likelihood: 3, impact: 3, business_impact: 'Information disclosure about internal structure.' },
  'Exposed Admin Panel': { likelihood: 4, impact: 4, business_impact: 'Direct attack surface for privilege abuse.' },
  'Open Unnecessary Ports': { likelihood: 3, impact: 3, business_impact: 'Expanded attack surface and lateral movement.' },
  'Cross-Site Scripting (XSS)': { likelihood: 4, impact: 4, business_impact: 'Account hijacking and client-side script abuse.' },
  'Cross-Site Request Forgery (CSRF)': { likelihood: 3, impact: 4, business_impact: 'Unauthorized user actions and transactions.' },
  'No Audit Logs': { likelihood: 3, impact: 3, business_impact: 'Delayed incident detection and investigation failures.' },
  'Outdated Server Software': { likelihood: 4, impact: 4, business_impact: 'Exploitation of known vulnerabilities.' }
};

const VULNERABILITY_CHECKLIST_MAPPING = {
  'Weak Password Policy': {
    control_id: 'PWD-001',
    control_name: 'Password Policy Enforcement',
    control_description: 'Verify password policy enforces minimum 8 characters and complexity.'
  },
  'No HTTPS / TLS': {
    control_id: 'TLS-001',
    control_name: 'TLS Enforcement',
    control_description: 'Verify TLS certificate installed and HTTPS enforced for all external endpoints.'
  },
  'No Account Lockout': {
    control_id: 'AUTH-002',
    control_name: 'Account Lockout',
    control_description: 'Verify account lockout is enabled after repeated failed login attempts.'
  },
  'No Audit Logs': {
    control_id: 'LOG-001',
    control_name: 'Audit Logging',
    control_description: 'Verify critical activities are logged and centrally monitored.'
  },
  'Outdated Server Software': {
    control_id: 'PATCH-001',
    control_name: 'Patch Management',
    control_description: 'Verify servers and components are updated based on patch policy.'
  }
};

const OCTAVE_ALLEGRO_CHECKLIST_TEMPLATE = [
  {
    control_id: 'OA-CRIT-001',
    control_name: 'Risk Measurement Criteria Definition',
    control_description: 'Confirm OCTAVE Allegro impact criteria (Confidentiality, Integrity, Availability and business impact) are defined before risk analysis.',
    category: 'Risk Governance'
  },
  {
    control_id: 'OA-ASSET-001',
    control_name: 'Information Asset Identification',
    control_description: 'Verify critical information assets are identified, named, and assigned clear ownership.',
    category: 'Asset Profiling'
  },
  {
    control_id: 'OA-CONT-TECH-001',
    control_name: 'Technical Container Profiling',
    control_description: 'Verify technical containers (servers, databases, applications, networks) are documented for each information asset.',
    category: 'Container Profiling'
  },
  {
    control_id: 'OA-CONT-PHYS-001',
    control_name: 'Physical Container Profiling',
    control_description: 'Verify physical containers (rooms, facilities, hardware locations) are identified for each information asset.',
    category: 'Container Profiling'
  },
  {
    control_id: 'OA-CONT-PEOPLE-001',
    control_name: 'People Container Profiling',
    control_description: 'Verify people containers (employees, contractors, third parties) with access to information assets are documented.',
    category: 'Container Profiling'
  },
  {
    control_id: 'OA-THREAT-001',
    control_name: 'Threat Scenario Documentation',
    control_description: 'Verify realistic threat scenarios are defined per asset/container, including source, access path, and potential event.',
    category: 'Threat Analysis'
  },
  {
    control_id: 'OA-VULN-001',
    control_name: 'Vulnerability Linkage (OWASP-Aligned)',
    control_description: 'Verify relevant vulnerabilities (e.g., SQLi, XSS, command injection) are mapped to impacted information assets.',
    category: 'Threat Analysis'
  },
  {
    control_id: 'OA-RISK-001',
    control_name: 'Likelihood x Impact Scoring',
    control_description: 'Verify each risk scenario is scored using Risk = Likelihood x Impact and retains score justification.',
    category: 'Risk Analysis'
  },
  {
    control_id: 'OA-RISK-002',
    control_name: 'Risk Matrix Classification',
    control_description: 'Verify risks are categorized into Low/Medium/High/Critical using defined matrix thresholds.',
    category: 'Risk Analysis'
  },
  {
    control_id: 'OA-MIT-001',
    control_name: 'Risk Mitigation Strategy Selection',
    control_description: 'Verify mitigation decisions are recorded for each significant risk (accept, reduce, transfer, avoid).',
    category: 'Mitigation Planning'
  },
  {
    control_id: 'OA-EVID-001',
    control_name: 'Evidence and Traceability',
    control_description: 'Verify audit evidence is attached to checklist controls and remains traceable to findings and recommendations.',
    category: 'Evidence Management'
  },
  {
    control_id: 'OA-FIND-001',
    control_name: 'Findings & Recommendation Quality',
    control_description: 'Verify each finding includes issue, risk, affected asset, and actionable recommendation aligned to OCTAVE Allegro outputs.',
    category: 'Reporting'
  }
];

function normalizeFrameworkName(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return 'OCTAVE Allegro';
  if (raw.includes('octave')) return 'OCTAVE Allegro';
  return 'OCTAVE Allegro';
}

async function ensureFrameworkChecklistTemplate({ framework, auditTaskId }) {
  const normalizedFramework = 'OCTAVE Allegro';
  const template = OCTAVE_ALLEGRO_CHECKLIST_TEMPLATE;
  const checklistColumns = await getTableColumns('audit_checklist');
  const hasAuditTaskId = checklistColumns.has('audit_task_id');
  const targetAuditTaskId = hasAuditTaskId
    ? (Number(auditTaskId) > 0 ? Number(auditTaskId) : await getDefaultAuditTaskIdForChecklist())
    : null;
  const allowedStatus = await getChecklistStatusEnumValues();
  const defaultStatus = normalizeChecklistStatusForDb('Not Assessed', allowedStatus);
  const hasControlId = checklistColumns.has('control_id');
  const hasControlName = checklistColumns.has('control_name');
  const hasControlTitle = checklistColumns.has('control_title');

  const selectFields = [
    hasControlId ? 'control_id' : 'NULL AS control_id',
    hasControlName ? 'control_name' : (hasControlTitle ? 'control_title AS control_name' : 'NULL AS control_name')
  ].join(', ');
  const [existingRows] = hasAuditTaskId
    ? await db.execute(
        `SELECT ${selectFields} FROM audit_checklist WHERE audit_task_id = ?`,
        [targetAuditTaskId]
      )
    : await db.execute(`SELECT ${selectFields} FROM audit_checklist`);
  const existingKeys = new Set(
    existingRows.map((row) => `${String(row.control_id || '').trim()}::${String(row.control_name || '').trim()}`)
  );

  for (const item of template) {
    const key = `${String(item.control_id || '').trim()}::${String(item.control_name || '').trim()}`;
    if (existingKeys.has(key)) continue;

    const cols = [];
    const vals = [];
    if (hasAuditTaskId) {
      cols.push('audit_task_id');
      vals.push(targetAuditTaskId);
    }
    if (checklistColumns.has('control_id')) {
      cols.push('control_id');
      vals.push(item.control_id || null);
    }
    if (checklistColumns.has('control_number')) {
      cols.push('control_number');
      vals.push(item.control_id || 'CTRL-001');
    }
    if (checklistColumns.has('control_name')) {
      cols.push('control_name');
      vals.push(item.control_name || 'Control');
    }
    if (checklistColumns.has('control_title')) {
      cols.push('control_title');
      vals.push(item.control_name || 'Control');
    }
    if (checklistColumns.has('control_description')) {
      cols.push('control_description');
      vals.push(item.control_description || '');
    }
    if (checklistColumns.has('category')) {
      cols.push('category');
      vals.push(item.category || normalizedFramework);
    }
    if (checklistColumns.has('compliance_status')) {
      cols.push('compliance_status');
      vals.push(defaultStatus);
    }
    if (checklistColumns.has('evidence_required')) {
      cols.push('evidence_required');
      vals.push(1);
    }
    if (checklistColumns.has('findings')) {
      cols.push('findings');
      vals.push('');
    }
    if (checklistColumns.has('evidence_notes')) {
      cols.push('evidence_notes');
      vals.push('');
    }

    const placeholders = cols.map(() => '?').join(', ');
    await db.execute(
      `INSERT INTO audit_checklist (${cols.join(', ')}) VALUES (${placeholders})`,
      vals
    );
  }

  return { auditTaskId: hasAuditTaskId ? targetAuditTaskId : null, framework: normalizedFramework };
}

async function ensureColumn(tableName, columnName, definition) {
  const [rows] = await db.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbConfig.database, tableName, columnName]
  );
  if (!rows.length) await db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

const tableColumnsCache = new Map();

async function getTableColumns(tableName) {
  if (tableColumnsCache.has(tableName)) return tableColumnsCache.get(tableName);
  const [rows] = await db.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbConfig.database, tableName]
  );
  const set = new Set(rows.map((r) => r.COLUMN_NAME));
  tableColumnsCache.set(tableName, set);
  return set;
}

async function getChecklistStatusEnumValues() {
  const [rows] = await db.execute(
    `SELECT COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'audit_checklist' AND COLUMN_NAME = 'compliance_status'`,
    [dbConfig.database]
  );
  const raw = rows[0]?.COLUMN_TYPE || '';
  const matches = [...raw.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  return new Set(matches);
}

function normalizeChecklistStatusForDb(status, allowed) {
  const value = status || 'Not Assessed';
  const map = {
    'Partially Compliant': 'Partial',
    'Not Assessed': 'Not Applicable'
  };
  const mapped = map[value] || value;
  if (allowed.has(mapped)) return mapped;
  if (allowed.has(value)) return value;
  if (allowed.has('Not Assessed')) return 'Not Assessed';
  if (allowed.has('Not Applicable')) return 'Not Applicable';
  return [...allowed][0] || value;
}

function normalizeChecklistStatusForApi(status) {
  if (status === 'Partial') return 'Partially Compliant';
  if (status === 'Not Applicable') return 'Not Assessed';
  return status || 'Not Assessed';
}

async function getDefaultAuditTaskIdForChecklist() {
  const [existing] = await db.execute('SELECT id FROM audit_tasks ORDER BY created_at DESC LIMIT 1');
  if (existing.length) return existing[0].id;

  const taskColumns = await getTableColumns('audit_tasks');
  const [frameworkMeta] = await db.execute(
    `SELECT COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'audit_tasks' AND COLUMN_NAME = 'framework'`,
    [dbConfig.database]
  );
  const frameworkValues = [...String(frameworkMeta[0]?.COLUMN_TYPE || '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const frameworkValue = frameworkValues.includes('OCTAVE Allegro')
    ? 'OCTAVE Allegro'
    : (frameworkValues.includes('OCTAVE') ? 'OCTAVE' : (frameworkValues[0] || 'ISO-27001'));
  const [orgRows] = await db.execute('SELECT id FROM organizations ORDER BY id ASC LIMIT 1');
  const fallbackOrgId = orgRows[0]?.id || null;

  const cols = [];
  const vals = [];
  if (taskColumns.has('title')) { cols.push('title'); vals.push('Default Audit Task'); }
  if (taskColumns.has('organization_id')) { cols.push('organization_id'); vals.push(fallbackOrgId); }
  if (taskColumns.has('auditor_id')) { cols.push('auditor_id'); vals.push(null); }
  if (taskColumns.has('framework')) { cols.push('framework'); vals.push(frameworkValue); }
  if (taskColumns.has('status')) { cols.push('status'); vals.push('pending'); }
  if (taskColumns.has('start_date')) { cols.push('start_date'); vals.push(new Date()); }
  if (taskColumns.has('end_date')) { cols.push('end_date'); vals.push(null); }

  const placeholders = cols.map(() => '?').join(', ');
  const [result] = await db.execute(`INSERT INTO audit_tasks (${cols.join(', ')}) VALUES (${placeholders})`, vals);
  return result.insertId;
}

async function resolveAuditTaskIdForEvidence(body) {
  if (body.audit_task_id) return Number(body.audit_task_id);
  if (body.checklist_item_id) {
    const [rows] = await db.execute('SELECT audit_task_id FROM audit_checklist WHERE id = ? LIMIT 1', [body.checklist_item_id]);
    const taskId = rows[0]?.audit_task_id;
    if (taskId) return Number(taskId);
  }
  return getDefaultAuditTaskIdForChecklist();
}

async function resolveUploadedByUserId(inputUserId, fallbackUserId) {
  const candidate = Number(inputUserId);
  if (Number.isInteger(candidate) && candidate > 0) {
    const [rows] = await db.execute('SELECT id FROM users WHERE id = ? LIMIT 1', [candidate]);
    if (rows.length) return candidate;
  }
  return Number(fallbackUserId);
}

function inferEvidenceType({ evidence_type, file_type, file_name, file_path }) {
  const explicit = String(evidence_type || '').trim();
  if (explicit) return explicit;

  const mime = String(file_type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'Screenshot';
  if (mime.includes('pdf') || mime.includes('word') || mime.includes('text')) return 'Document';
  if (mime.includes('log')) return 'Log File';

  const fileRef = String(file_name || file_path || '').toLowerCase();
  const ext = fileRef.includes('.') ? fileRef.split('.').pop() : '';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) return 'Screenshot';
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'md'].includes(ext)) return 'Document';
  if (['log'].includes(ext)) return 'Log File';
  if (['conf', 'ini', 'yaml', 'yml', 'json', 'xml'].includes(ext)) return 'Configuration';
  return 'Other';
}

async function resolveAuditTaskIdForFinding(body, preferredTaskId) {
  const taskId = Number(preferredTaskId || body?.audit_task_id || 0);
  if (Number.isInteger(taskId) && taskId > 0) return taskId;
  return getDefaultAuditTaskIdForChecklist();
}

async function getOrCreateLatestAuditTaskForOrganization(organizationId) {
  const orgId = Number(organizationId || 0);
  if (!Number.isInteger(orgId) || orgId <= 0) return getDefaultAuditTaskIdForChecklist();
  const [rows] = await db.execute(
    'SELECT id FROM audit_tasks WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1',
    [orgId]
  );
  if (rows.length) return rows[0].id;

  // Last resort: create a task with schema-aware inserts.
  const taskColumns = await getTableColumns('audit_tasks');
  const [frameworkMeta] = await db.execute(
    `SELECT COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'audit_tasks' AND COLUMN_NAME = 'framework'`,
    [dbConfig.database]
  );
  const frameworkValues = [...String(frameworkMeta[0]?.COLUMN_TYPE || '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const frameworkValue = frameworkValues.includes('OCTAVE Allegro')
    ? 'OCTAVE Allegro'
    : (frameworkValues.includes('OCTAVE') ? 'OCTAVE' : (frameworkValues[0] || 'ISO-27001'));

  const [auditors] = await db.execute("SELECT id FROM users WHERE role = 'auditor' ORDER BY id ASC LIMIT 1");
  const [anyUsers] = await db.execute('SELECT id FROM users ORDER BY id ASC LIMIT 1');
  const fallbackAuditorId = auditors[0]?.id || anyUsers[0]?.id || 1;

  const cols = [];
  const vals = [];
  if (taskColumns.has('title')) { cols.push('title'); vals.push(`Auto Audit Task - Org ${orgId}`); }
  if (taskColumns.has('organization_id')) { cols.push('organization_id'); vals.push(orgId); }
  if (taskColumns.has('auditor_id')) { cols.push('auditor_id'); vals.push(fallbackAuditorId); }
  if (taskColumns.has('framework')) { cols.push('framework'); vals.push(frameworkValue); }
  if (taskColumns.has('status')) { cols.push('status'); vals.push('pending'); }
  if (taskColumns.has('start_date')) { cols.push('start_date'); vals.push(new Date()); }
  if (taskColumns.has('end_date')) { cols.push('end_date'); vals.push(null); }

  const placeholders = cols.map(() => '?').join(', ');
  const [result] = await db.execute(`INSERT INTO audit_tasks (${cols.join(', ')}) VALUES (${placeholders})`, vals);
  return result.insertId;
}

async function ensureOrganizationReportBaselineData(organizationId, organizationName) {
  const orgId = Number(organizationId || 0);
  if (!Number.isInteger(orgId) || orgId <= 0) return { auditTaskId: null };

  const auditTaskId = await getOrCreateLatestAuditTaskForOrganization(orgId);
  await ensureFrameworkChecklistTemplate({ framework: PLATFORM_FRAMEWORK, auditTaskId });

  const [existingAssets] = await db.execute(
    'SELECT id FROM assets WHERE organization_id = ? ORDER BY id ASC LIMIT 1',
    [orgId]
  );
  let primaryAssetId = existingAssets[0]?.id || null;

  if (!primaryAssetId) {
    const assetColumns = await getTableColumns('assets');
    const cols = [];
    const vals = [];
    if (assetColumns.has('name')) { cols.push('name'); vals.push(`${organizationName || `Organization ${orgId}`} Core Information Asset`); }
    if (assetColumns.has('asset_type')) { cols.push('asset_type'); vals.push('Information'); }
    if (assetColumns.has('asset_class')) { cols.push('asset_class'); vals.push('Application'); }
    if (assetColumns.has('container_type')) { cols.push('container_type'); vals.push('Technical'); }
    if (assetColumns.has('description')) { cols.push('description'); vals.push('Auto-created baseline asset for organization-specific reporting.'); }
    if (assetColumns.has('owner')) { cols.push('owner'); vals.push('Security Team'); }
    if (assetColumns.has('location')) { cols.push('location'); vals.push('Primary Data Center'); }
    if (assetColumns.has('cia_value')) { cols.push('cia_value'); vals.push('Medium'); }
    if (assetColumns.has('criticality')) { cols.push('criticality'); vals.push('Medium'); }
    if (assetColumns.has('confidentiality')) { cols.push('confidentiality'); vals.push(3); }
    if (assetColumns.has('integrity')) { cols.push('integrity'); vals.push(3); }
    if (assetColumns.has('availability')) { cols.push('availability'); vals.push(3); }
    if (assetColumns.has('criticality_score')) { cols.push('criticality_score'); vals.push(60); }
    if (assetColumns.has('security_requirements')) { cols.push('security_requirements'); vals.push('Access control, encryption in transit, periodic backup.'); }
    if (assetColumns.has('organization_id')) { cols.push('organization_id'); vals.push(orgId); }
    if (cols.length) {
      const placeholders = cols.map(() => '?').join(', ');
      const [result] = await db.execute(`INSERT INTO assets (${cols.join(', ')}) VALUES (${placeholders})`, vals);
      primaryAssetId = result.insertId;
    }
  }

  if (primaryAssetId) {
    const [existingRisks] = await db.execute(
      'SELECT id FROM octave_risk_assessments WHERE organization_id = ? ORDER BY id ASC LIMIT 1',
      [orgId]
    );
    if (!existingRisks.length) {
      const riskColumns = await getTableColumns('octave_risk_assessments');
      const cols = [];
      const vals = [];
      if (riskColumns.has('organization_id')) { cols.push('organization_id'); vals.push(orgId); }
      if (riskColumns.has('asset_id')) { cols.push('asset_id'); vals.push(primaryAssetId); }
      if (riskColumns.has('threat_scenario')) { cols.push('threat_scenario'); vals.push('Unauthorized access to critical information due to weak authentication controls.'); }
      if (riskColumns.has('impact_area')) { cols.push('impact_area'); vals.push('Data/Information'); }
      if (riskColumns.has('impact_level')) { cols.push('impact_level'); vals.push('Medium'); }
      if (riskColumns.has('probability')) { cols.push('probability'); vals.push('Medium'); }
      if (riskColumns.has('certainty')) { cols.push('certainty'); vals.push('Medium'); }
      if (riskColumns.has('likelihood')) { cols.push('likelihood'); vals.push(2); }
      if (riskColumns.has('impact')) { cols.push('impact'); vals.push(3); }
      if (riskColumns.has('risk_score')) { cols.push('risk_score'); vals.push(6); }
      if (riskColumns.has('risk_level')) { cols.push('risk_level'); vals.push('Medium'); }
      if (riskColumns.has('relative_risk_score')) { cols.push('relative_risk_score'); vals.push(6); }
      if (riskColumns.has('mitigation_strategy')) { cols.push('mitigation_strategy'); vals.push('Enforce MFA and periodic access reviews.'); }
      if (riskColumns.has('assessment_phase')) { cols.push('assessment_phase'); vals.push('Identify Risks'); }
      if (cols.length) {
        const placeholders = cols.map(() => '?').join(', ');
        await db.execute(`INSERT INTO octave_risk_assessments (${cols.join(', ')}) VALUES (${placeholders})`, vals);
      }
    }
  }

  const findingColumns = await getTableColumns('audit_findings');
  const hasFindingOrgId = findingColumns.has('organization_id');
  const hasFindingTaskId = findingColumns.has('audit_task_id');
  let hasFindingData = false;
  if (hasFindingOrgId) {
    const [rows] = await db.execute('SELECT id FROM audit_findings WHERE organization_id = ? LIMIT 1', [orgId]);
    hasFindingData = rows.length > 0;
  } else if (hasFindingTaskId) {
    const [rows] = await db.execute('SELECT id FROM audit_findings WHERE audit_task_id = ? LIMIT 1', [auditTaskId]);
    hasFindingData = rows.length > 0;
  }

  if (!hasFindingData && findingColumns.size > 0) {
    const cols = [];
    const vals = [];
    if (hasFindingTaskId) { cols.push('audit_task_id'); vals.push(auditTaskId); }
    if (hasFindingOrgId) { cols.push('organization_id'); vals.push(orgId); }
    if (findingColumns.has('title')) { cols.push('title'); vals.push('Baseline Security Finding'); }
    if (findingColumns.has('issue')) { cols.push('issue'); vals.push('Initial control baseline has not been fully validated.'); }
    if (findingColumns.has('risk')) { cols.push('risk'); vals.push('Potential control effectiveness gap.'); }
    if (findingColumns.has('description')) { cols.push('description'); vals.push('Auto-generated baseline finding to initialize organization-specific reporting data.'); }
    if (findingColumns.has('risk_level')) { cols.push('risk_level'); vals.push('Medium'); }
    if (findingColumns.has('category')) { cols.push('category'); vals.push('Security'); }
    if (findingColumns.has('affected_asset')) { cols.push('affected_asset'); vals.push('Core Information Asset'); }
    if (findingColumns.has('recommendation')) { cols.push('recommendation'); vals.push('Complete checklist review and attach supporting evidence.'); }
    if (findingColumns.has('status')) { cols.push('status'); vals.push('Open'); }
    if (findingColumns.has('finding_date')) { cols.push('finding_date'); vals.push(new Date().toISOString().slice(0, 10)); }
    if (cols.length) {
      const placeholders = cols.map(() => '?').join(', ');
      await db.execute(`INSERT INTO audit_findings (${cols.join(', ')}) VALUES (${placeholders})`, vals);
    }
  }

  return { auditTaskId };
}

async function getOrganizationComplianceStats(organizationId) {
  const orgId = Number(organizationId || 0);
  if (!Number.isInteger(orgId) || orgId <= 0) {
    return { organization_id: null, total_controls: 0, compliant_controls: 0, compliance_percentage: 0 };
  }

  const checklistColumns = await getTableColumns('audit_checklist');
  if (!checklistColumns.has('audit_task_id') || !checklistColumns.has('compliance_status')) {
    return { organization_id: orgId, total_controls: 0, compliant_controls: 0, compliance_percentage: 0 };
  }

  const [rows] = await db.execute(
    `SELECT
      COUNT(*) AS total_controls,
      SUM(CASE WHEN LOWER(TRIM(ac.compliance_status)) = 'compliant' THEN 1 ELSE 0 END) AS compliant_controls
     FROM audit_checklist ac
     INNER JOIN audit_tasks at ON at.id = ac.audit_task_id
     WHERE at.organization_id = ?`,
    [orgId]
  );
  const total = Number(rows[0]?.total_controls || 0);
  const compliant = Number(rows[0]?.compliant_controls || 0);
  const percentage = total ? Number(((compliant / total) * 100).toFixed(2)) : 0;
  return {
    organization_id: orgId,
    total_controls: total,
    compliant_controls: compliant,
    compliance_percentage: percentage
  };
}

async function bootstrapDatabase() {
  const rootConfig = { ...dbConfig };
  delete rootConfig.database;
  const root = await mysql.createConnection(rootConfig);
  await root.execute(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
  await root.end();
  db = await mysql.createConnection(dbConfig);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      business_sector VARCHAR(120) DEFAULT 'Technology',
      employee_count INT DEFAULT 0,
      system_type TEXT,
      exposure_level ENUM('Low','Medium','High','Critical') DEFAULT 'Medium',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      role ENUM('admin','auditor','auditee') NOT NULL DEFAULT 'auditee',
      organization_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS assets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      asset_type ENUM('Information') DEFAULT 'Information',
      asset_class ENUM('Application','Server','Data') DEFAULT 'Application',
      container_type ENUM('Technical','Physical','People') DEFAULT 'Technical',
      description TEXT,
      owner VARCHAR(255),
      location VARCHAR(255),
      cia_value ENUM('Low','Medium','High') DEFAULT 'Medium',
      criticality ENUM('Low','Medium','High','Critical') DEFAULT 'Medium',
      confidentiality TINYINT DEFAULT 3,
      integrity TINYINT DEFAULT 3,
      availability TINYINT DEFAULT 3,
      criticality_score DECIMAL(8,2) DEFAULT 60.00,
      security_requirements TEXT,
      organization_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS vulnerabilities (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(120) NOT NULL,
      description TEXT,
      cwe_id VARCHAR(25),
      owasp_rank INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS asset_vulnerabilities (
      id INT AUTO_INCREMENT PRIMARY KEY,
      asset_id INT NOT NULL,
      vulnerability_id INT NOT NULL,
      likelihood INT DEFAULT 2,
      impact INT DEFAULT 2,
      risk_score DECIMAL(8,2) DEFAULT 4,
      risk_level ENUM('Low','Medium','High','Critical') DEFAULT 'Medium',
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_asset_vuln (asset_id, vulnerability_id),
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      FOREIGN KEY (vulnerability_id) REFERENCES vulnerabilities(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS threat_actors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type ENUM('External','Internal','Accidental') DEFAULT 'External',
      motivation ENUM('Financial','Ideological','Revenge','Espionage','Opportunistic','Unknown') DEFAULT 'Unknown',
      capability_level ENUM('Low','Medium','High') DEFAULT 'Medium',
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS octave_risk_assessments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NULL,
      asset_id INT NOT NULL,
      threat_actor_id INT NULL,
      threat_scenario TEXT NOT NULL,
      impact_area ENUM('Reputation','Financial','Productivity','Safety','Legal/Regulatory','Data/Information') DEFAULT 'Financial',
      impact_level ENUM('Very Low','Low','Medium','High','Very High') DEFAULT 'Medium',
      probability ENUM('Very Low','Low','Medium','High','Very High') DEFAULT 'Medium',
      certainty ENUM('Very Low','Low','Medium','High','Very High') DEFAULT 'Medium',
      likelihood INT DEFAULT 2,
      impact INT DEFAULT 2,
      risk_score DECIMAL(8,2) DEFAULT 4,
      risk_level ENUM('Low','Medium','High','Critical') DEFAULT 'Medium',
      relative_risk_score DECIMAL(8,2) DEFAULT 4,
      mitigation_strategy TEXT,
      residual_risk_score DECIMAL(8,2) DEFAULT 0,
      assessment_phase ENUM('Establish Criteria','Profile Assets','Identify Threats','Identify Risks','Analyze Risks','Select Mitigation') DEFAULT 'Identify Threats',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      FOREIGN KEY (threat_actor_id) REFERENCES threat_actors(id) ON DELETE SET NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      organization_id INT NULL,
      auditor_id INT NULL,
      framework ENUM('OCTAVE Allegro') DEFAULT 'OCTAVE Allegro',
      status ENUM('pending','in_progress','completed') DEFAULT 'pending',
      start_date DATE NULL,
      end_date DATE NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
      FOREIGN KEY (auditor_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_checklist (
      id INT AUTO_INCREMENT PRIMARY KEY,
      audit_task_id INT NULL,
      control_id VARCHAR(60),
      control_name VARCHAR(255) NOT NULL,
      control_description TEXT,
      category VARCHAR(120) DEFAULT 'Access Control',
      compliance_status ENUM('Compliant','Partially Compliant','Non-Compliant','Not Assessed') DEFAULT 'Not Assessed',
      evidence_required BOOLEAN DEFAULT TRUE,
      findings TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (audit_task_id) REFERENCES audit_tasks(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_evidence (
      id INT AUTO_INCREMENT PRIMARY KEY,
      audit_task_id INT NULL,
      checklist_item_id INT NULL,
      evidence_type VARCHAR(120),
      file_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      file_type VARCHAR(120),
      file_size BIGINT DEFAULT 0,
      description TEXT,
      upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      uploaded_by INT NULL,
      evidence_references TEXT,
      FOREIGN KEY (audit_task_id) REFERENCES audit_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (checklist_item_id) REFERENCES audit_checklist(id) ON DELETE SET NULL,
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_findings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      audit_task_id INT NULL,
      organization_id INT NULL,
      title VARCHAR(255) NOT NULL,
      issue TEXT,
      risk TEXT,
      description TEXT NOT NULL,
      risk_level ENUM('Low','Medium','High','Critical') DEFAULT 'Medium',
      category VARCHAR(120) DEFAULT 'Security',
      affected_asset VARCHAR(255),
      recommendation TEXT,
      status ENUM('Open','In Progress','Resolved') DEFAULT 'Open',
      finding_date DATE DEFAULT (CURRENT_DATE),
      due_date DATE NULL,
      assigned_to VARCHAR(255),
      evidence_references TEXT,
      ai_generated BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (audit_task_id) REFERENCES audit_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS compliance_scores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NULL,
      audit_task_id INT NULL,
      assessment_date DATE NOT NULL,
      overall_score DECIMAL(8,2) NOT NULL,
      recommendations TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
      FOREIGN KEY (audit_task_id) REFERENCES audit_tasks(id) ON DELETE SET NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NULL,
      audit_task_id INT NULL,
      report_type ENUM('Security Audit','Risk Assessment','Compliance','Executive') DEFAULT 'Security Audit',
      format ENUM('PDF','DOCX') DEFAULT 'PDF',
      file_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      generated_by VARCHAR(255) NOT NULL,
      generated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status ENUM('Generating','Completed','Failed') DEFAULT 'Completed',
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
      FOREIGN KEY (audit_task_id) REFERENCES audit_tasks(id) ON DELETE SET NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ai_consultations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      query TEXT NOT NULL,
      response TEXT,
      consultation_type ENUM('vulnerability_explanation','risk_assessment','control_recommendation','audit_advice') NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await ensureColumn('organizations', 'system_type', 'TEXT');
  await ensureColumn('assets', 'criticality_score', 'DECIMAL(8,2) DEFAULT 60.00');
  await ensureColumn('assets', 'confidentiality', 'TINYINT DEFAULT 3');
  await ensureColumn('assets', 'integrity', 'TINYINT DEFAULT 3');
  await ensureColumn('assets', 'availability', 'TINYINT DEFAULT 3');
  await ensureColumn('assets', 'asset_class', 'ENUM(\'Application\',\'Server\',\'Data\') DEFAULT \'Application\'');
  await ensureColumn('assets', 'cia_value', 'ENUM(\'Low\',\'Medium\',\'High\') DEFAULT \'Medium\'');
  await ensureColumn('assets', 'container_type', 'ENUM(\'Technical\',\'Physical\',\'People\') DEFAULT \'Technical\'');
  await ensureColumn('assets', 'criticality', 'ENUM(\'Low\',\'Medium\',\'High\',\'Critical\') DEFAULT \'Medium\'');
  await ensureColumn('assets', 'description', 'TEXT');
  await ensureColumn('assets', 'security_requirements', 'TEXT');
  await ensureColumn('octave_risk_assessments', 'likelihood', 'INT DEFAULT 2');
  await ensureColumn('octave_risk_assessments', 'impact', 'INT DEFAULT 2');
  await ensureColumn('octave_risk_assessments', 'risk_score', 'DECIMAL(8,2) DEFAULT 4');
  await ensureColumn('octave_risk_assessments', 'risk_level', 'ENUM(\'Low\',\'Medium\',\'High\',\'Critical\') DEFAULT \'Medium\'');
  await ensureColumn('octave_risk_assessments', 'relative_risk_score', 'DECIMAL(8,2) DEFAULT 4');
  await ensureColumn('octave_risk_assessments', 'mitigation_strategy', 'TEXT');
  await ensureColumn('octave_risk_assessments', 'assessment_phase', 'ENUM(\'Establish Criteria\',\'Profile Assets\',\'Identify Threats\',\'Identify Risks\',\'Analyze Risks\',\'Select Mitigation\') DEFAULT \'Identify Threats\'');
  await ensureColumn('asset_vulnerabilities', 'likelihood', 'INT DEFAULT 2');
  await ensureColumn('asset_vulnerabilities', 'impact', 'INT DEFAULT 2');
  await ensureColumn('asset_vulnerabilities', 'risk_score', 'DECIMAL(8,2) DEFAULT 4');
  await ensureColumn('asset_vulnerabilities', 'risk_level', 'ENUM(\'Low\',\'Medium\',\'High\',\'Critical\') DEFAULT \'Medium\'');
  await ensureColumn('asset_vulnerabilities', 'description', 'TEXT');
  await ensureColumn('audit_checklist', 'control_id', 'VARCHAR(60)');
  await ensureColumn('audit_checklist', 'category', 'VARCHAR(120) DEFAULT \'Access Control\'');
  await ensureColumn('audit_checklist', 'evidence_required', 'BOOLEAN DEFAULT TRUE');
  await ensureColumn('audit_evidence', 'file_size', 'BIGINT DEFAULT 0');
  await ensureColumn('compliance_scores', 'compliant_controls', 'INT DEFAULT 0');
  await ensureColumn('compliance_scores', 'total_controls', 'INT DEFAULT 0');
  await ensureColumn('compliance_scores', 'compliance_percentage', 'DECIMAL(8,2) DEFAULT 0.00');

  const [orgRows] = await db.execute('SELECT COUNT(*) AS count FROM organizations');
  if (!orgRows[0].count) {
    await db.execute(
      `INSERT INTO organizations (name, business_sector, employee_count, system_type, exposure_level)
       VALUES (?, ?, ?, ?, ?)`,
      ['Default Organization', 'Technology', 200, 'internal,web', 'Medium']
    );
  }

  const [usersRows] = await db.execute('SELECT COUNT(*) AS count FROM users');
  if (!usersRows[0].count) {
    const adminHash = await bcrypt.hash('admin123', 10);
    const auditorHash = await bcrypt.hash('auditor123', 10);
    const auditeeHash = await bcrypt.hash('auditee123', 10);
    await db.execute(
      `INSERT INTO users (email, password, full_name, role, organization_id) VALUES
       ('admin@cybersec.com', ?, 'Cybersecurity Administrator', 'admin', 1),
       ('auditor@cybersec.com', ?, 'Security Auditor', 'auditor', 1),
       ('auditee@cybersec.com', ?, 'System Owner', 'auditee', 1)`,
      [adminHash, auditorHash, auditeeHash]
    );
  }

  const requiredVulns = [
    ['SQL Injection', 'Injection', 'SQL queries can be manipulated by unsanitized input.', 'CWE-89', 1],
    ['Command Injection', 'Injection', 'OS commands can be injected and executed on server.', 'CWE-77', 2],
    ['LDAP Injection', 'Injection', 'LDAP queries can be altered to bypass authentication.', 'CWE-90', 3],
    ['Weak Password Policy', 'Broken Authentication', 'Password policy does not enforce complexity or minimum length.', 'CWE-521', 4],
    ['No Account Lockout', 'Broken Authentication', 'Unlimited login attempts allow brute-force attacks.', 'CWE-307', 5],
    ['Session Hijacking', 'Broken Authentication', 'Session tokens can be stolen or reused.', 'CWE-384', 6],
    ['No HTTPS / TLS', 'Sensitive Data Exposure', 'Traffic is unencrypted and vulnerable to interception.', 'CWE-319', 7],
    ['Weak Encryption', 'Sensitive Data Exposure', 'Cryptographic controls are weak or outdated.', 'CWE-327', 8],
    ['Exposed Database Backup', 'Sensitive Data Exposure', 'Backup files are reachable without authorization.', 'CWE-200', 9],
    ['IDOR (Insecure Direct Object Reference)', 'Access Control Failures', 'Object references are predictable and unauthorized data can be accessed.', 'CWE-639', 10],
    ['Privilege Escalation', 'Access Control Failures', 'Users can gain higher privilege than intended.', 'CWE-269', 11],
    ['Default Credentials', 'Security Misconfiguration', 'Default usernames/passwords remain enabled.', 'CWE-798', 12],
    ['Directory Listing Enabled', 'Security Misconfiguration', 'Directory browsing reveals sensitive files and paths.', 'CWE-548', 13],
    ['Exposed Admin Panel', 'Security Misconfiguration', 'Administrative interfaces are publicly reachable.', 'CWE-306', 14],
    ['Open Unnecessary Ports', 'Security Misconfiguration', 'Unused services expose additional attack surface.', 'CWE-16', 15],
    ['Cross-Site Scripting (XSS)', 'Cross-Site Attacks', 'Malicious scripts execute in user browser context.', 'CWE-79', 16],
    ['Cross-Site Request Forgery (CSRF)', 'Cross-Site Attacks', 'Unauthorized requests are performed on behalf of users.', 'CWE-352', 17],
    ['No Audit Logs', 'Logging & Monitoring Failure', 'Security events are not logged for detection/investigation.', 'CWE-778', 18],
    ['Outdated Server Software', 'Dependency & Software Issues', 'Known vulnerable software versions remain in production.', 'CWE-1104', 19]
  ];

  for (const [name, category, description, cweId, rank] of requiredVulns) {
    const [exists] = await db.execute('SELECT id FROM vulnerabilities WHERE name = ? LIMIT 1', [name]);
    if (!exists.length) {
      await db.execute(
        'INSERT INTO vulnerabilities (name, category, description, cwe_id, owasp_rank) VALUES (?, ?, ?, ?, ?)',
        [name, category, description, cweId, rank]
      );
    }
  }

  const [actorsRows] = await db.execute('SELECT COUNT(*) AS count FROM threat_actors');
  if (!actorsRows[0].count) {
    await db.execute(
      `INSERT INTO threat_actors (name, type, motivation, capability_level, description) VALUES
       ('Organized Cybercrime Group', 'External', 'Financial', 'High', 'Targets exposed internet assets for ransomware and fraud.'),
       ('Disgruntled Insider', 'Internal', 'Revenge', 'Medium', 'Abuses privileged access for sabotage or data theft.'),
       ('Careless Employee', 'Accidental', 'Opportunistic', 'Low', 'Triggers incidents through social engineering or misconfiguration.')`
    );
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
    return next();
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, framework: 'OCTAVE Allegro', timestamp: new Date().toISOString() });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await dbExecute(
      `SELECT u.id, u.email, u.password, u.full_name, u.role, u.organization_id, o.name AS organization_name
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       WHERE u.email = ?`,
      [email]
    );

    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const validPassword = await bcrypt.compare(password || '', user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, organization_id: user.organization_id },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        organization_id: user.organization_id,
        organization_name: user.organization_name
      }
    });
  } catch (_error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/users', authenticateToken, async (req, res) => {
  let query = `
    SELECT u.id, u.email, u.full_name, u.role, u.organization_id, u.created_at, o.name AS organization_name
    FROM users u
    LEFT JOIN organizations o ON o.id = u.organization_id
  `;
  const params = [];

  if (req.user.role === 'auditor') {
    query += ' WHERE u.role = ?';
    params.push('auditor');
  } else if (req.user.role === 'auditee') {
    query += ' WHERE u.role = ?';
    params.push('auditee');
  }

  query += ' ORDER BY u.created_at DESC';
  const [rows] = await db.execute(query, params);
  res.json({ data: rows });
});

app.post('/api/users', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { email, full_name, role, organization_id, password } = req.body;
    const hash = await bcrypt.hash(password || 'changeme123', 10);
    const [result] = await db.execute(
      `INSERT INTO users (email, password, full_name, role, organization_id)
       VALUES (?, ?, ?, ?, ?)`,
      [email, hash, full_name, role || 'auditee', organization_id || null]
    );
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/users/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { email, full_name, role, organization_id, password } = req.body;
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await db.execute(
        `UPDATE users SET email = ?, full_name = ?, role = ?, organization_id = ?, password = ? WHERE id = ?`,
        [email, full_name, role, organization_id || null, hash, req.params.id]
      );
    } else {
      await db.execute(
        `UPDATE users SET email = ?, full_name = ?, role = ?, organization_id = ? WHERE id = ?`,
        [email, full_name, role, organization_id || null, req.params.id]
      );
    }
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/users/:id', authenticateToken, authorize('admin'), async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (Number(req.user?.id) === userId) {
    return res.status(400).json({ error: 'You cannot delete the currently logged-in account' });
  }

  try {
    await db.beginTransaction();

    const [targetRows] = await db.execute('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!targetRows.length) {
      await db.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    const [fkRefs] = await db.execute(
      `SELECT
         kcu.TABLE_NAME,
         kcu.COLUMN_NAME,
         c.IS_NULLABLE,
         rc.DELETE_RULE
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
       INNER JOIN INFORMATION_SCHEMA.COLUMNS c
         ON c.TABLE_SCHEMA = kcu.TABLE_SCHEMA
        AND c.TABLE_NAME = kcu.TABLE_NAME
        AND c.COLUMN_NAME = kcu.COLUMN_NAME
       LEFT JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
         ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
        AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
       WHERE kcu.REFERENCED_TABLE_SCHEMA = ?
         AND kcu.REFERENCED_TABLE_NAME = 'users'
         AND kcu.REFERENCED_COLUMN_NAME = 'id'`,
      [dbConfig.database]
    );

    // Legacy schemas may keep audit_tasks.auditor_id as NOT NULL/RESTRICT.
    // In that case we reassign tasks instead of deleting tasks.
    const [fallbackRows] = await db.execute(
      `SELECT id
       FROM users
       WHERE id <> ?
       ORDER BY (role = 'admin') DESC, (role = 'auditor') DESC, id ASC
       LIMIT 1`,
      [userId]
    );
    const fallbackUserId = Number(fallbackRows[0]?.id || 0);

    for (const ref of fkRefs) {
      const tableName = String(ref.TABLE_NAME || '').replace(/`/g, '');
      const columnName = String(ref.COLUMN_NAME || '').replace(/`/g, '');
      const deleteRule = String(ref.DELETE_RULE || '').toUpperCase();
      const isNullable = String(ref.IS_NULLABLE || '').toUpperCase() === 'YES';
      if (!tableName || !columnName) continue;

      // Skip the users table itself.
      if (tableName === 'users') continue;

      if (deleteRule === 'SET NULL' || deleteRule === 'CASCADE') {
        continue;
      }

      if (tableName === 'audit_tasks' && columnName === 'auditor_id') {
        if (!fallbackUserId) {
          await db.rollback();
          return res.status(400).json({ error: 'Cannot delete this user because no fallback user exists for assigned audits' });
        }
        await db.execute('UPDATE `audit_tasks` SET `auditor_id` = ? WHERE `auditor_id` = ?', [fallbackUserId, userId]);
        continue;
      }

      if ((tableName === 'ai_consultations' && columnName === 'user_id')
        || (tableName === 'audit_evidence' && columnName === 'uploaded_by')) {
        if (!fallbackUserId) {
          await db.rollback();
          return res.status(400).json({ error: `Cannot delete this user because no fallback user exists for '${tableName}.${columnName}'` });
        }
        await db.execute(`UPDATE \`${tableName}\` SET \`${columnName}\` = ? WHERE \`${columnName}\` = ?`, [fallbackUserId, userId]);
        continue;
      }

      if (isNullable) {
        await db.execute(`UPDATE \`${tableName}\` SET \`${columnName}\` = NULL WHERE \`${columnName}\` = ?`, [userId]);
      } else {
        await db.rollback();
        return res.status(400).json({
          error: `Cannot delete user: '${tableName}.${columnName}' requires reassignment or schema update`
        });
      }
    }

    const [result] = await db.execute('DELETE FROM users WHERE id = ?', [userId]);
    if (!result.affectedRows) {
      await db.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    await db.commit();
    return res.json({ success: true });
  } catch (error) {
    try {
      await db.rollback();
    } catch (_rollbackError) {
      // ignore rollback failures
    }
    return res.status(400).json({ error: error.message || 'Failed to delete user' });
  }
});

app.get('/api/organizations', authenticateToken, async (req, res) => {
  let query = 'SELECT * FROM organizations';
  let params = [];
  if (req.user.role === 'auditee') {
    query += ' WHERE id = ?';
    params = [req.user.organization_id];
  }
  query += ' ORDER BY created_at DESC';
  const [rows] = await db.execute(query, params);
  res.json({ data: rows });
});

app.post('/api/organizations', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { name, business_sector, employee_count, system_type } = req.body;
    const exposure = calculateExposureLevel({
      sector: business_sector,
      employeeCount: employee_count,
      environment: system_type
    });

    const [result] = await db.execute(
      `INSERT INTO organizations (name, business_sector, employee_count, system_type, exposure_level)
       VALUES (?, ?, ?, ?, ?)`,
      [name, business_sector || 'Technology', employee_count || 0, system_type || '', exposure]
    );

    res.json({ success: true, id: result.insertId, exposure_level: exposure });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/organizations/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { name, business_sector, employee_count, system_type } = req.body;
    const exposure = calculateExposureLevel({
      sector: business_sector,
      employeeCount: employee_count,
      environment: Array.isArray(system_type) ? system_type.join(',') : system_type
    });

    await db.execute(
      `UPDATE organizations
       SET name = ?, business_sector = ?, employee_count = ?, system_type = ?, exposure_level = ?
       WHERE id = ?`,
      [
        name,
        business_sector || 'Technology',
        Number(employee_count || 0),
        Array.isArray(system_type) ? system_type.join(',') : (system_type || ''),
        exposure,
        req.params.id
      ]
    );
    res.json({ success: true, exposure_level: exposure });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/organizations/:id', authenticateToken, authorize('admin'), async (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    return res.status(400).json({ error: 'Invalid organization id' });
  }

  try {
    await db.beginTransaction();

    const [orgRows] = await db.execute('SELECT id, name FROM organizations WHERE id = ? LIMIT 1', [organizationId]);
    if (!orgRows.length) {
      await db.rollback();
      return res.status(404).json({ error: 'Organization not found' });
    }
    const fallbackOrgName = 'Unassigned Organization';
    if (String(orgRows[0].name || '').trim().toLowerCase() === fallbackOrgName.toLowerCase()) {
      await db.rollback();
      return res.status(400).json({ error: 'Cannot delete the fallback organization' });
    }

    let fallbackOrganizationId = null;
    const ensureFallbackOrganizationId = async () => {
      if (fallbackOrganizationId) return fallbackOrganizationId;
      const [rows] = await db.execute(
        'SELECT id FROM organizations WHERE LOWER(name) = LOWER(?) LIMIT 1',
        [fallbackOrgName]
      );
      if (rows.length) {
        fallbackOrganizationId = rows[0].id;
        return fallbackOrganizationId;
      }
      const [inserted] = await db.execute(
        `INSERT INTO organizations (name, business_sector, employee_count, system_type, exposure_level)
         VALUES (?, 'Other', 0, 'Internal', 'Low')`,
        [fallbackOrgName]
      );
      fallbackOrganizationId = inserted.insertId;
      return fallbackOrganizationId;
    };

    const [fkRefs] = await db.execute(
      `SELECT
         kcu.TABLE_NAME,
         kcu.COLUMN_NAME,
         c.IS_NULLABLE,
         COALESCE(rc.DELETE_RULE, '') AS DELETE_RULE
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
       INNER JOIN INFORMATION_SCHEMA.COLUMNS c
         ON c.TABLE_SCHEMA = kcu.TABLE_SCHEMA
        AND c.TABLE_NAME = kcu.TABLE_NAME
        AND c.COLUMN_NAME = kcu.COLUMN_NAME
       LEFT JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
         ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
        AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
       WHERE kcu.REFERENCED_TABLE_SCHEMA = ?
         AND kcu.REFERENCED_TABLE_NAME = 'organizations'
         AND kcu.REFERENCED_COLUMN_NAME = 'id'`,
      [dbConfig.database]
    );

    for (const ref of fkRefs) {
      const tableName = String(ref.TABLE_NAME || '').replace(/`/g, '');
      const columnName = String(ref.COLUMN_NAME || '').replace(/`/g, '');
      const deleteRule = String(ref.DELETE_RULE || '').toUpperCase();
      const isNullable = String(ref.IS_NULLABLE || '').toUpperCase() === 'YES';
      if (!tableName || !columnName || tableName === 'organizations') continue;

      if (deleteRule === 'SET NULL' || deleteRule === 'CASCADE') {
        continue;
      }

      if (isNullable) {
        await db.execute(
          `UPDATE \`${tableName}\` SET \`${columnName}\` = NULL WHERE \`${columnName}\` = ?`,
          [organizationId]
        );
      } else {
        const fallbackId = await ensureFallbackOrganizationId();
        await db.execute(
          `UPDATE \`${tableName}\` SET \`${columnName}\` = ? WHERE \`${columnName}\` = ?`,
          [fallbackId, organizationId]
        );
      }
    }

    const [result] = await db.execute('DELETE FROM organizations WHERE id = ?', [organizationId]);
    if (!result.affectedRows) {
      await db.rollback();
      return res.status(404).json({ error: 'Organization not found' });
    }

    await db.commit();
    return res.json({ success: true });
  } catch (error) {
    try {
      await db.rollback();
    } catch (_rollbackError) {
      // ignore rollback failures
    }
    return res.status(400).json({ error: error.message || 'Failed to delete organization' });
  }
});

app.get('/api/assets', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT a.*, o.name AS organization_name
      FROM assets a
      LEFT JOIN organizations o ON o.id = a.organization_id
    `;
    const params = [];
    if (req.user.role === 'auditee') {
      query += ' WHERE a.organization_id = ? ';
      params.push(req.user.organization_id);
    }
    query += ' ORDER BY a.created_at DESC';
    const [rows] = await dbExecute(query, params);
    const normalizedRows = rows.map((row) => {
      const score = Number(row.criticality_score || 0);
      return {
        ...row,
        container_type: normalizeContainerType(row.container_type) || row.container_type || 'Unknown',
        criticality: criticalityFromScore(score)
      };
    });
    res.json({ data: normalizedRows });
  } catch (error) {
    console.error('Assets list failed:', error.message);
    res.status(500).json({ error: 'Failed to load assets' });
  }
});

app.post('/api/assets', authenticateToken, async (req, res) => {
  try {
    const assetColumns = await getTableColumns('assets');
    const source = req.body;
    const containerType = normalizeContainerType(source.container_type);
    if (!containerType) return res.status(400).json({ error: 'Invalid container type. Use Technical, Physical, or People.' });
    const ciaLevel = source.cia_value || 'Medium';
    const ciaMap = { Low: 2, Medium: 3, High: 5 };
    const derivedCia = ciaMap[ciaLevel] || 3;
    
    // Use frontend values directly if provided, otherwise derive from cia_level
    const confidentiality = Number(source.confidentiality) || derivedCia;
    const integrity = Number(source.integrity) || derivedCia;
    const availability = Number(source.availability) || derivedCia;
    
    const criticalityScore = calculateCriticalityScore({
      confidentiality,
      integrity,
      availability,
      businessCriticality: source.criticality
    });
    const computedCriticality = criticalityFromScore(criticalityScore);

    const insertCols = ['name'];
    const insertVals = [source.name];

    if (assetColumns.has('asset_type')) { insertCols.push('asset_type'); insertVals.push('Information'); }
    if (assetColumns.has('type')) { insertCols.push('type'); insertVals.push(source.asset_class || 'Application'); }
    if (assetColumns.has('asset_class')) { insertCols.push('asset_class'); insertVals.push(source.asset_class || 'Application'); }
    if (assetColumns.has('container_type')) { insertCols.push('container_type'); insertVals.push(containerType); }
    if (assetColumns.has('description')) { insertCols.push('description'); insertVals.push(source.description || ''); }
    if (assetColumns.has('owner')) { insertCols.push('owner'); insertVals.push(source.owner || 'Unknown'); }
    if (assetColumns.has('location')) { insertCols.push('location'); insertVals.push(source.location || 'Unknown'); }
    if (assetColumns.has('cia_value')) { insertCols.push('cia_value'); insertVals.push(ciaLevel); }
    if (assetColumns.has('criticality')) { insertCols.push('criticality'); insertVals.push(computedCriticality); }
    if (assetColumns.has('confidentiality')) { insertCols.push('confidentiality'); insertVals.push(confidentiality); }
    if (assetColumns.has('integrity')) { insertCols.push('integrity'); insertVals.push(integrity); }
    if (assetColumns.has('availability')) { insertCols.push('availability'); insertVals.push(availability); }
    if (assetColumns.has('criticality_score')) { insertCols.push('criticality_score'); insertVals.push(criticalityScore); }
    if (assetColumns.has('security_requirements')) { insertCols.push('security_requirements'); insertVals.push(source.security_requirements || ''); }
    if (assetColumns.has('organization_id')) { insertCols.push('organization_id'); insertVals.push(source.organization_id || req.user.organization_id || 1); }

    const placeholders = insertCols.map(() => '?').join(', ');
    const [result] = await dbExecute(
      `INSERT INTO assets (${insertCols.join(', ')}) VALUES (${placeholders})`,
      insertVals
    );
    res.json({ success: true, id: result.insertId, criticality_score: criticalityScore, criticality: computedCriticality });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/assets/:id', authenticateToken, async (req, res) => {
  try {
    const assetColumns = await getTableColumns('assets');
    const source = req.body;
    const containerType = normalizeContainerType(source.container_type);
    if (!containerType) return res.status(400).json({ error: 'Invalid container type. Use Technical, Physical, or People.' });
    const ciaLevel = source.cia_value || 'Medium';
    const ciaMap = { Low: 2, Medium: 3, High: 5 };
    const derivedCia = ciaMap[ciaLevel] || 3;
    
    // Use frontend values directly if provided, otherwise derive from cia_level
    const confidentiality = Number(source.confidentiality) || derivedCia;
    const integrity = Number(source.integrity) || derivedCia;
    const availability = Number(source.availability) || derivedCia;
    
    const criticalityScore = calculateCriticalityScore({
      confidentiality,
      integrity,
      availability,
      businessCriticality: source.criticality
    });
    const computedCriticality = criticalityFromScore(criticalityScore);

    const updates = ['name = ?'];
    const values = [source.name];
    if (assetColumns.has('type')) { updates.push('type = ?'); values.push(source.asset_class || 'Application'); }
    if (assetColumns.has('asset_class')) { updates.push('asset_class = ?'); values.push(source.asset_class || 'Application'); }
    if (assetColumns.has('container_type')) { updates.push('container_type = ?'); values.push(containerType); }
    if (assetColumns.has('description')) { updates.push('description = ?'); values.push(source.description || ''); }
    if (assetColumns.has('owner')) { updates.push('owner = ?'); values.push(source.owner || 'Unknown'); }
    if (assetColumns.has('location')) { updates.push('location = ?'); values.push(source.location || 'Unknown'); }
    if (assetColumns.has('cia_value')) { updates.push('cia_value = ?'); values.push(ciaLevel); }
    if (assetColumns.has('criticality')) { updates.push('criticality = ?'); values.push(computedCriticality); }
    if (assetColumns.has('confidentiality')) { updates.push('confidentiality = ?'); values.push(confidentiality); }
    if (assetColumns.has('integrity')) { updates.push('integrity = ?'); values.push(integrity); }
    if (assetColumns.has('availability')) { updates.push('availability = ?'); values.push(availability); }
    if (assetColumns.has('criticality_score')) { updates.push('criticality_score = ?'); values.push(criticalityScore); }
    if (assetColumns.has('security_requirements')) { updates.push('security_requirements = ?'); values.push(source.security_requirements || ''); }
    if (assetColumns.has('organization_id')) { updates.push('organization_id = ?'); values.push(source.organization_id || req.user.organization_id || 1); }
    values.push(req.params.id);

    await dbExecute(`UPDATE assets SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true, criticality_score: criticalityScore, criticality: computedCriticality });
  } catch (error) {
    console.error('Asset save failed:', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/assets/:id', authenticateToken, async (req, res) => {
  try {
    const assetId = Number(req.params.id);
    if (!Number.isInteger(assetId) || assetId <= 0) {
      return res.status(400).json({ error: 'Invalid asset id' });
    }

    await db.beginTransaction();

    const [assetRows] = await db.execute('SELECT id FROM assets WHERE id = ? LIMIT 1', [assetId]);
    if (!assetRows.length) {
      await db.rollback();
      return res.status(404).json({ error: 'Asset not found' });
    }

    const [fkRefs] = await db.execute(
      `SELECT
         kcu.TABLE_NAME,
         kcu.COLUMN_NAME,
         c.IS_NULLABLE,
         rc.DELETE_RULE
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
       INNER JOIN INFORMATION_SCHEMA.COLUMNS c
         ON c.TABLE_SCHEMA = kcu.TABLE_SCHEMA
        AND c.TABLE_NAME = kcu.TABLE_NAME
        AND c.COLUMN_NAME = kcu.COLUMN_NAME
       LEFT JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
         ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
        AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
       WHERE kcu.REFERENCED_TABLE_SCHEMA = ?
         AND kcu.REFERENCED_TABLE_NAME = 'assets'
         AND kcu.REFERENCED_COLUMN_NAME = 'id'`,
      [dbConfig.database]
    );

    for (const ref of fkRefs) {
      const tableName = String(ref.TABLE_NAME || '').replace(/`/g, '');
      const columnName = String(ref.COLUMN_NAME || '').replace(/`/g, '');
      const deleteRule = String(ref.DELETE_RULE || '').toUpperCase();
      const isNullable = String(ref.IS_NULLABLE || '').toUpperCase() === 'YES';
      if (!tableName || !columnName) continue;

      if (deleteRule === 'CASCADE' || deleteRule === 'SET NULL') {
        continue;
      }

      if (isNullable) {
        await db.execute(`UPDATE \`${tableName}\` SET \`${columnName}\` = NULL WHERE \`${columnName}\` = ?`, [assetId]);
      } else {
        await db.execute(`DELETE FROM \`${tableName}\` WHERE \`${columnName}\` = ?`, [assetId]);
      }
    }

    const [result] = await db.execute('DELETE FROM assets WHERE id = ?', [assetId]);
    if (!result.affectedRows) {
      await db.rollback();
      return res.status(404).json({ error: 'Asset not found' });
    }

    await db.commit();
    return res.json({ success: true });
  } catch (error) {
    try {
      await db.rollback();
    } catch (_rollbackError) {
      // ignore rollback failures
    }
    console.error('Asset delete failed:', error.message);
    res.status(400).json({ error: error.message || 'Failed to delete asset' });
  }
});

app.get('/api/vulnerabilities', authenticateToken, async (_req, res) => {
  const [rows] = await db.execute('SELECT * FROM vulnerabilities ORDER BY owasp_rank ASC, id ASC');
  res.json({ data: rows });
});

app.get('/api/assets/:id/vulnerabilities', authenticateToken, async (req, res) => {
  const [rows] = await db.execute(
    `SELECT av.*, v.name, v.category, v.description AS vulnerability_description, v.cwe_id, v.owasp_rank
     FROM asset_vulnerabilities av
     INNER JOIN vulnerabilities v ON v.id = av.vulnerability_id
     WHERE av.asset_id = ?
     ORDER BY av.risk_score DESC`,
    [req.params.id]
  );
  const normalized = [];
  for (const row of rows) {
    // Canonicalize using mapping by vulnerability name when available.
    // This keeps risk scores stable across page reload/navigation.
    const mapped = VULNERABILITY_RISK_MAPPING[row.name];
    const likelihood = numericLikelihood(mapped?.likelihood ?? row.likelihood);
    const impact = numericImpact(mapped?.impact ?? row.impact);
    const riskScore = Number((likelihood * impact).toFixed(2));
    const riskLevel = riskLevelFromScore(riskScore);

    const shouldUpdate =
      Number(row.likelihood) !== likelihood ||
      Number(row.impact) !== impact ||
      Number(row.risk_score) !== riskScore ||
      row.risk_level !== riskLevel;

    if (shouldUpdate) {
      await db.execute(
        'UPDATE asset_vulnerabilities SET likelihood = ?, impact = ?, risk_score = ?, risk_level = ? WHERE id = ?',
        [likelihood, impact, riskScore, riskLevel, row.id]
      );
    }

    normalized.push({
      ...row,
      likelihood,
      impact,
      risk_score: riskScore,
      risk_level: riskLevel
    });
  }

  res.json({ data: normalized });
});

app.get('/api/assets-vulnerabilities', authenticateToken, async (_req, res) => {
  const [rows] = await db.execute(
    `SELECT av.*, v.name, v.category, v.description AS vulnerability_description, v.cwe_id, v.owasp_rank
     FROM asset_vulnerabilities av
     INNER JOIN vulnerabilities v ON v.id = av.vulnerability_id
     ORDER BY av.asset_id ASC, av.risk_score DESC`
  );

  const normalized = [];
  for (const row of rows) {
    const mapped = VULNERABILITY_RISK_MAPPING[row.name];
    const likelihood = numericLikelihood(mapped?.likelihood ?? row.likelihood);
    const impact = numericImpact(mapped?.impact ?? row.impact);
    const riskScore = Number((likelihood * impact).toFixed(2));
    const riskLevel = riskLevelFromScore(riskScore);

    const shouldUpdate =
      Number(row.likelihood) !== likelihood ||
      Number(row.impact) !== impact ||
      Number(row.risk_score) !== riskScore ||
      row.risk_level !== riskLevel;

    if (shouldUpdate) {
      await db.execute(
        'UPDATE asset_vulnerabilities SET likelihood = ?, impact = ?, risk_score = ?, risk_level = ? WHERE id = ?',
        [likelihood, impact, riskScore, riskLevel, row.id]
      );
    }

    normalized.push({
      ...row,
      likelihood,
      impact,
      risk_score: riskScore,
      risk_level: riskLevel
    });
  }

  res.json({ data: normalized });
});

app.post('/api/assets/:id/vulnerabilities', authenticateToken, async (req, res) => {
  try {
    const [vulnRows] = await db.execute('SELECT id, name FROM vulnerabilities WHERE id = ? LIMIT 1', [req.body.vulnerability_id]);
    if (!vulnRows.length) return res.status(404).json({ error: 'Vulnerability not found' });
    const vulnName = vulnRows[0].name;
    const autoRule = VULNERABILITY_RISK_MAPPING[vulnName] || { likelihood: 2, impact: 2, business_impact: 'Potential compromise of information asset.' };

    const likelihood = numericLikelihood(req.body.likelihood || autoRule.likelihood);
    const impact = numericImpact(req.body.impact || autoRule.impact);
    const riskScore = likelihood * impact;
    const level = riskLevelFromScore(riskScore);

    await db.execute(
      `INSERT INTO asset_vulnerabilities (asset_id, vulnerability_id, likelihood, impact, risk_score, risk_level, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE likelihood = VALUES(likelihood), impact = VALUES(impact), risk_score = VALUES(risk_score), risk_level = VALUES(risk_level), description = VALUES(description)`,
      [req.params.id, req.body.vulnerability_id, likelihood, impact, riskScore, level, req.body.description || autoRule.business_impact]
    );

    const checklistTemplate = VULNERABILITY_CHECKLIST_MAPPING[vulnName];
    if (checklistTemplate) {
      const [existingChecklist] = await db.execute(
        `SELECT id FROM audit_checklist WHERE control_id = ? AND control_name = ? LIMIT 1`,
        [checklistTemplate.control_id, checklistTemplate.control_name]
      );
      if (!existingChecklist.length) {
        await db.execute(
          `INSERT INTO audit_checklist
           (control_id, control_name, control_description, category, compliance_status, evidence_required, findings)
           VALUES (?, ?, ?, 'Access Control', 'Not Assessed', 1, ?)`,
          [
            checklistTemplate.control_id,
            checklistTemplate.control_name,
            checklistTemplate.control_description,
            `Auto-generated from vulnerability mapping: ${vulnName}`
          ]
        );
      }
    }

    res.json({
      success: true,
      risk_score: riskScore,
      risk_level: level,
      auto_likelihood: likelihood,
      auto_impact: impact,
      business_impact: autoRule.business_impact
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/assets/:assetId/vulnerabilities/:vulnId', authenticateToken, async (req, res) => {
  await db.execute(
    'DELETE FROM asset_vulnerabilities WHERE asset_id = ? AND vulnerability_id = ?',
    [req.params.assetId, req.params.vulnId]
  );
  res.json({ success: true });
});

app.get('/api/threat-actors', authenticateToken, async (_req, res) => {
  const [rows] = await db.execute('SELECT * FROM threat_actors ORDER BY id DESC');
  res.json({ data: rows });
});

app.get('/api/octave-risk-assessments', authenticateToken, async (req, res) => {
  let query = `
    SELECT ora.*, a.name AS asset_name, ta.name AS threat_actor_name, o.name AS organization_name
    FROM octave_risk_assessments ora
    INNER JOIN assets a ON a.id = ora.asset_id
    LEFT JOIN threat_actors ta ON ta.id = ora.threat_actor_id
    LEFT JOIN organizations o ON o.id = ora.organization_id
  `;
  const params = [];
  if (req.user.role === 'auditee') {
    query += ' WHERE ora.organization_id = ?';
    params.push(req.user.organization_id);
  }
  query += ' ORDER BY ora.created_at DESC';
  const [rows] = await db.execute(query, params);
  res.json({ data: rows });
});

app.post('/api/octave-risk-assessments', authenticateToken, async (req, res) => {
  try {
    const likelihood = numericLikelihood(req.body.probability || req.body.likelihood);
    const impact = numericImpact(req.body.impact_level || req.body.impact);
    const score = likelihood * impact;
    const level = riskLevelFromScore(score);
    const relative = req.body.relative_risk_score ? Number(req.body.relative_risk_score) : score;

    const [assetRows] = await db.execute('SELECT organization_id FROM assets WHERE id = ?', [req.body.asset_id]);
    const orgId = req.body.organization_id || assetRows[0]?.organization_id || req.user.organization_id || 1;

    const [result] = await db.execute(
      `INSERT INTO octave_risk_assessments
       (organization_id, asset_id, threat_actor_id, threat_scenario, impact_area, impact_level, probability, certainty, likelihood, impact, risk_score, risk_level, relative_risk_score, mitigation_strategy, assessment_phase)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId,
        req.body.asset_id,
        req.body.threat_actor_id || null,
        req.body.threat_scenario,
        req.body.impact_area || 'Financial',
        req.body.impact_level || 'Medium',
        req.body.probability || 'Medium',
        req.body.certainty || 'Medium',
        likelihood,
        impact,
        score,
        level,
        relative,
        req.body.mitigation_strategy || '',
        req.body.assessment_phase || 'Identify Threats'
      ]
    );

    res.json({ success: true, id: result.insertId, risk_score: score, risk_level: level });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/octave-risk-assessments/:id', authenticateToken, async (req, res) => {
  try {
    const likelihood = numericLikelihood(req.body.probability || req.body.likelihood);
    const impact = numericImpact(req.body.impact_level || req.body.impact);
    const score = likelihood * impact;
    const level = riskLevelFromScore(score);
    const relative = req.body.relative_risk_score ? Number(req.body.relative_risk_score) : score;

    await db.execute(
      `UPDATE octave_risk_assessments SET
       asset_id = ?, threat_actor_id = ?, threat_scenario = ?, impact_area = ?, impact_level = ?, probability = ?, certainty = ?,
       likelihood = ?, impact = ?, risk_score = ?, risk_level = ?, relative_risk_score = ?, mitigation_strategy = ?, assessment_phase = ?
       WHERE id = ?`,
      [
        req.body.asset_id,
        req.body.threat_actor_id || null,
        req.body.threat_scenario,
        req.body.impact_area || 'Financial',
        req.body.impact_level || 'Medium',
        req.body.probability || 'Medium',
        req.body.certainty || 'Medium',
        likelihood,
        impact,
        score,
        level,
        relative,
        req.body.mitigation_strategy || '',
        req.body.assessment_phase || 'Identify Threats',
        req.params.id
      ]
    );

    res.json({ success: true, risk_score: score, risk_level: level });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/octave-risk-assessments/:id', authenticateToken, async (req, res) => {
  await db.execute('DELETE FROM octave_risk_assessments WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/risk-assessments', authenticateToken, async (_req, res) => {
  const [rows] = await db.execute(
    `SELECT id, asset_id, threat_scenario AS threat_description,
     mitigation_strategy AS mitigation_plan, likelihood, impact, risk_score, risk_level, created_at
     FROM octave_risk_assessments ORDER BY created_at DESC`
  );
  res.json({ data: rows });
});

app.post('/api/risk-assessments', authenticateToken, async (req, res) => {
  try {
    const likelihood = numericLikelihood(req.body.likelihood);
    const impact = numericImpact(req.body.impact);
    const score = likelihood * impact;
    const level = req.body.risk_level || riskLevelFromScore(score);

    const [assetRows] = await db.execute('SELECT organization_id FROM assets WHERE id = ?', [req.body.asset_id]);
    const orgId = assetRows[0]?.organization_id || req.user.organization_id || 1;

    const [result] = await db.execute(
      `INSERT INTO octave_risk_assessments
      (organization_id, asset_id, threat_scenario, impact_area, impact_level, probability, certainty, likelihood, impact, risk_score, risk_level, relative_risk_score, mitigation_strategy, assessment_phase)
      VALUES (?, ?, ?, 'Data/Information', ?, ?, 'Medium', ?, ?, ?, ?, ?, ?, 'Analyze Risks')`,
      [
        orgId,
        req.body.asset_id,
        req.body.threat_description || 'Threat not specified',
        req.body.impact || 'Medium',
        req.body.likelihood || 'Medium',
        likelihood,
        impact,
        score,
        level,
        score,
        req.body.mitigation_plan || ''
      ]
    );
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/risk-assessments/:id', authenticateToken, async (req, res) => {
  try {
    const likelihood = numericLikelihood(req.body.likelihood);
    const impact = numericImpact(req.body.impact);
    const score = likelihood * impact;
    const level = req.body.risk_level || riskLevelFromScore(score);

    await db.execute(
      `UPDATE octave_risk_assessments
       SET asset_id = ?, threat_scenario = ?, impact_level = ?, probability = ?,
           likelihood = ?, impact = ?, risk_score = ?, risk_level = ?, relative_risk_score = ?, mitigation_strategy = ?
       WHERE id = ?`,
      [
        req.body.asset_id,
        req.body.threat_description || 'Threat not specified',
        req.body.impact || 'Medium',
        req.body.likelihood || 'Medium',
        likelihood,
        impact,
        score,
        level,
        score,
        req.body.mitigation_plan || '',
        req.params.id
      ]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/risk-assessments/:id', authenticateToken, async (req, res) => {
  await db.execute('DELETE FROM octave_risk_assessments WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/risk-engine/matrix', authenticateToken, async (_req, res) => {
  const [rows] = await db.execute(`
    SELECT likelihood, impact, COUNT(*) AS count
    FROM asset_vulnerabilities
    GROUP BY likelihood, impact
    ORDER BY likelihood, impact
  `);
  res.json({ data: rows });
});

app.get('/api/audits', authenticateToken, async (req, res) => {
  let query = `
    SELECT at.*, o.name AS organization_name, u.full_name AS auditor_name
    FROM audit_tasks at
    LEFT JOIN organizations o ON o.id = at.organization_id
    LEFT JOIN users u ON u.id = at.auditor_id
  `;
  const params = [];
  if (req.user.role === 'auditor') {
    query += ' WHERE at.auditor_id = ?';
    params.push(req.user.id);
  } else if (req.user.role === 'auditee') {
    query += ' WHERE at.organization_id = ?';
    params.push(req.user.organization_id);
  }
  query += ' ORDER BY at.created_at DESC';
  const [rows] = await db.execute(query, params);
  res.json({ data: rows });
});

app.get('/api/audits/my-audits', authenticateToken, authorize('auditor'), async (req, res) => {
  const [rows] = await db.execute(
    `SELECT at.*, o.name AS organization_name
     FROM audit_tasks at
     LEFT JOIN organizations o ON o.id = at.organization_id
     WHERE at.auditor_id = ?
     ORDER BY at.created_at DESC`,
    [req.user.id]
  );
  res.json({ data: rows });
});

app.get('/api/audits/my-tasks', authenticateToken, async (req, res) => {
  if (req.user.role === 'auditor') {
    const [rows] = await db.execute('SELECT * FROM audit_tasks WHERE auditor_id = ? ORDER BY created_at DESC', [req.user.id]);
    return res.json({ data: rows });
  }
  if (req.user.role === 'auditee') {
    const [rows] = await db.execute('SELECT * FROM audit_tasks WHERE organization_id = ? ORDER BY created_at DESC', [req.user.organization_id]);
    return res.json({ data: rows });
  }
  const [rows] = await db.execute('SELECT * FROM audit_tasks ORDER BY created_at DESC');
  return res.json({ data: rows });
});

app.post('/api/audits', authenticateToken, authorize('admin', 'auditor'), async (req, res) => {
  const [result] = await db.execute(
    `INSERT INTO audit_tasks (title, organization_id, auditor_id, framework, status, start_date, end_date)
     VALUES (?, ?, ?, 'OCTAVE Allegro', ?, ?, ?)`,
    [
      req.body.title,
      req.body.organization_id || req.user.organization_id || 1,
      req.body.auditor_id || (req.user.role === 'auditor' ? req.user.id : null),
      req.body.status || 'pending',
      req.body.start_date || null,
      req.body.end_date || null
    ]
  );
  res.json({ success: true, id: result.insertId });
});

app.put('/api/audits/:id', authenticateToken, authorize('admin', 'auditor'), async (req, res) => {
  await db.execute(
    `UPDATE audit_tasks
     SET title = ?, organization_id = ?, auditor_id = ?, status = ?, start_date = ?, end_date = ?
     WHERE id = ?`,
    [
      req.body.title,
      req.body.organization_id,
      req.body.auditor_id,
      req.body.status,
      req.body.start_date || null,
      req.body.end_date || null,
      req.params.id
    ]
  );
  res.json({ success: true });
});

app.delete('/api/audits/:id', authenticateToken, authorize('admin'), async (req, res) => {
  await db.execute('DELETE FROM audit_tasks WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/audits/assign', authenticateToken, authorize('admin'), async (req, res) => {
  const { auditor_id, audit_id, organization_id } = req.body;
  await db.execute(
    'UPDATE audit_tasks SET auditor_id = ?, organization_id = ? WHERE id = ?',
    [auditor_id, organization_id || null, audit_id]
  );
  res.json({ success: true });
});

app.get('/api/audits/:id/checklist', authenticateToken, async (req, res) => {
  const [rows] = await db.execute('SELECT * FROM audit_checklist WHERE audit_task_id = ? ORDER BY id DESC', [req.params.id]);
  res.json({ data: rows });
});

app.put('/api/audits/:auditId/checklist/:itemId', authenticateToken, async (req, res) => {
  const { compliance_status, findings } = req.body;
  await db.execute(
    'UPDATE audit_checklist SET compliance_status = ?, findings = ? WHERE id = ? AND audit_task_id = ?',
    [compliance_status, findings || '', req.params.itemId, req.params.auditId]
  );
  res.json({ success: true });
});

app.get('/api/audit-checklist', authenticateToken, async (req, res) => {
  try {
    let resolvedTemplateTaskId = null;
    let resolvedFramework = null;
    const shouldSeedTemplate = String(req.query.seed_template || '').toLowerCase() !== '0';
    if (req.query.framework && shouldSeedTemplate) {
      const seeded = await ensureFrameworkChecklistTemplate({
        framework: req.query.framework,
        auditTaskId: req.query.audit_task_id
      });
      resolvedTemplateTaskId = seeded.auditTaskId;
      resolvedFramework = seeded.framework;
    }

    const checklistColumns = await getTableColumns('audit_checklist');
    let query = 'SELECT * FROM audit_checklist';
    const params = [];
    if (req.query.audit_task_id && checklistColumns.has('audit_task_id')) {
      query += ' WHERE audit_task_id = ?';
      params.push(req.query.audit_task_id);
    } else if (resolvedTemplateTaskId && checklistColumns.has('audit_task_id')) {
      query += ' WHERE audit_task_id = ?';
      params.push(resolvedTemplateTaskId);
    }
    query += ' ORDER BY id DESC';
    const [rows] = await db.execute(query, params);
    const normalized = rows.map((row) => ({
      ...row,
      control_id: row.control_id || row.control_number || '',
      control_name: row.control_name || row.control_title || '',
      compliance_status: normalizeChecklistStatusForApi(row.compliance_status),
      evidence_required: row.evidence_required !== false && row.evidence_required !== 0
    }));
    res.json({
      data: normalized,
      framework: resolvedFramework || normalizeFrameworkName(req.query.framework),
      audit_task_id: resolvedTemplateTaskId || Number(req.query.audit_task_id || 0) || null
    });
  } catch (error) {
    console.error('Audit checklist load failed:', error.message);
    res.status(500).json({ error: error.message || 'Failed to load audit checklist' });
  }
});

app.post('/api/audit-checklist', authenticateToken, async (req, res) => {
  try {
    const checklistColumns = await getTableColumns('audit_checklist');
    const allowedStatus = await getChecklistStatusEnumValues();
    const statusValue = normalizeChecklistStatusForDb(req.body.compliance_status, allowedStatus);
    const values = [];
    const cols = [];

    if (checklistColumns.has('audit_task_id')) {
      const auditTaskId = req.body.audit_task_id || (await getDefaultAuditTaskIdForChecklist());
      cols.push('audit_task_id');
      values.push(auditTaskId);
    }

    if (checklistColumns.has('control_id')) {
      cols.push('control_id');
      values.push(req.body.control_id || null);
    }
    if (checklistColumns.has('control_number')) {
      cols.push('control_number');
      values.push(req.body.control_id || 'CTRL-001');
    }

    if (checklistColumns.has('control_name')) {
      cols.push('control_name');
      values.push(req.body.control_name || 'Control');
    }
    if (checklistColumns.has('control_title')) {
      cols.push('control_title');
      values.push(req.body.control_name || 'Control');
    }

    if (checklistColumns.has('control_description')) {
      cols.push('control_description');
      values.push(req.body.control_description || '');
    }
    if (checklistColumns.has('category')) {
      cols.push('category');
      values.push(req.body.category || 'Access Control');
    }
    if (checklistColumns.has('compliance_status')) {
      cols.push('compliance_status');
      values.push(statusValue);
    }
    if (checklistColumns.has('evidence_required')) {
      cols.push('evidence_required');
      values.push(req.body.evidence_required === false ? 0 : 1);
    }
    if (checklistColumns.has('findings')) {
      cols.push('findings');
      values.push(req.body.findings || '');
    }
    if (checklistColumns.has('evidence_notes')) {
      cols.push('evidence_notes');
      values.push(req.body.findings || '');
    }

    const placeholders = cols.map(() => '?').join(', ');
    const [result] = await db.execute(
      `INSERT INTO audit_checklist (${cols.join(', ')}) VALUES (${placeholders})`,
      values
    );
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/audit-checklist/:id', authenticateToken, async (req, res) => {
  try {
    const checklistColumns = await getTableColumns('audit_checklist');
    const allowedStatus = await getChecklistStatusEnumValues();
    const statusValue = normalizeChecklistStatusForDb(req.body.compliance_status, allowedStatus);
    const updates = [];
    const values = [];

    if (checklistColumns.has('audit_task_id')) {
      const auditTaskId = req.body.audit_task_id || (await getDefaultAuditTaskIdForChecklist());
      updates.push('audit_task_id = ?');
      values.push(auditTaskId);
    }
    if (checklistColumns.has('control_id')) { updates.push('control_id = ?'); values.push(req.body.control_id || null); }
    if (checklistColumns.has('control_number')) { updates.push('control_number = ?'); values.push(req.body.control_id || 'CTRL-001'); }
    if (checklistColumns.has('control_name')) { updates.push('control_name = ?'); values.push(req.body.control_name || 'Control'); }
    if (checklistColumns.has('control_title')) { updates.push('control_title = ?'); values.push(req.body.control_name || 'Control'); }
    if (checklistColumns.has('control_description')) { updates.push('control_description = ?'); values.push(req.body.control_description || ''); }
    if (checklistColumns.has('category')) { updates.push('category = ?'); values.push(req.body.category || 'Access Control'); }
    if (checklistColumns.has('compliance_status')) { updates.push('compliance_status = ?'); values.push(statusValue); }
    if (checklistColumns.has('evidence_required')) { updates.push('evidence_required = ?'); values.push(req.body.evidence_required === false ? 0 : 1); }
    if (checklistColumns.has('findings')) { updates.push('findings = ?'); values.push(req.body.findings || ''); }
    if (checklistColumns.has('evidence_notes')) { updates.push('evidence_notes = ?'); values.push(req.body.findings || ''); }

    values.push(req.params.id);
    await db.execute(`UPDATE audit_checklist SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/audit-checklist/:id', authenticateToken, async (req, res) => {
  try {
    const checklistId = Number(req.params.id);
    if (!Number.isFinite(checklistId) || checklistId <= 0) {
      return res.status(400).json({ error: 'Invalid checklist item id' });
    }

    const evidenceColumns = await getTableColumns('audit_evidence');
    if (evidenceColumns.has('checklist_item_id')) {
      // Compatible with legacy schemas that may still enforce RESTRICT on FK.
      await db.execute('UPDATE audit_evidence SET checklist_item_id = NULL WHERE checklist_item_id = ?', [checklistId]);
    }

    const [result] = await db.execute('DELETE FROM audit_checklist WHERE id = ?', [checklistId]);
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Checklist item not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/audit-evidence', authenticateToken, async (req, res) => {
  const evidenceColumns = await getTableColumns('audit_evidence');
  let query = 'SELECT * FROM audit_evidence';
  const params = [];
  if (req.query.audit_task_id && evidenceColumns.has('audit_task_id')) {
    query += ' WHERE audit_task_id = ?';
    params.push(req.query.audit_task_id);
  }
  const orderField = evidenceColumns.has('upload_date') ? 'upload_date' : 'id';
  query += ` ORDER BY ${orderField} DESC`;
  const [rows] = await db.execute(query, params);
  const normalized = rows.map((row) => ({
    ...row,
    // Keep stored value stable; only infer when there is no stored type.
    evidence_type: String(row.evidence_type || '').trim() || inferEvidenceType(row),
    description: row.description || '',
    evidence_references: row.evidence_references || '',
  }));
  res.json({ data: normalized });
});

app.post('/api/audit-evidence/upload', authenticateToken, evidenceUploadSingle, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const evidenceColumns = await getTableColumns('audit_evidence');
    const uploadedById = await resolveUploadedByUserId(req.body.uploaded_by, req.user.id);
    const cols = [];
    const vals = [];

    if (evidenceColumns.has('audit_task_id')) {
      cols.push('audit_task_id');
      vals.push(await resolveAuditTaskIdForEvidence(req.body));
    }
    if (evidenceColumns.has('checklist_item_id')) {
      cols.push('checklist_item_id');
      vals.push(req.body.checklist_item_id || null);
    }
    if (evidenceColumns.has('evidence_type')) {
      cols.push('evidence_type');
      vals.push(inferEvidenceType({
        evidence_type: req.body.evidence_type,
        file_type: req.file?.mimetype,
        file_name: req.file?.originalname
      }));
    }
    cols.push('file_name');
    vals.push(req.file.originalname);
    cols.push('file_path');
    vals.push(`/uploads/${req.file.filename}`);
    if (evidenceColumns.has('file_type')) {
      cols.push('file_type');
      vals.push(req.file.mimetype);
    }
    if (evidenceColumns.has('file_size')) {
      cols.push('file_size');
      vals.push(req.file.size);
    }
    if (evidenceColumns.has('description')) {
      cols.push('description');
      vals.push(req.body.description || '');
    }
    if (evidenceColumns.has('uploaded_by')) {
      cols.push('uploaded_by');
      vals.push(uploadedById);
    }
    if (evidenceColumns.has('evidence_references')) {
      cols.push('evidence_references');
      vals.push(req.body.evidence_references || '');
    }

    const placeholders = cols.map(() => '?').join(', ');
    const [result] = await db.execute(
      `INSERT INTO audit_evidence (${cols.join(', ')}) VALUES (${placeholders})`,
      vals
    );
    res.json({ success: true, id: result.insertId, file_name: req.file.originalname, file_path: `/uploads/${req.file.filename}` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/audit-evidence/upload-multiple', authenticateToken, evidenceUploadMultiple, async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ error: 'No files uploaded' });
    if (files.length > MAX_EVIDENCE_FILES) {
      return res.status(400).json({ error: `Too many files selected. Maximum number of files is ${MAX_EVIDENCE_FILES}` });
    }
    const totalSize = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    if (totalSize > MAX_EVIDENCE_FILE_SIZE_BYTES) {
      return res.status(400).json({ error: `Selected files are too large together. Maximum total size is ${Math.floor(MAX_EVIDENCE_FILE_SIZE_BYTES / (1024 * 1024))} MB` });
    }

    const evidenceColumns = await getTableColumns('audit_evidence');
    const uploadedById = await resolveUploadedByUserId(req.body.uploaded_by, req.user.id);
    const auditTaskId = evidenceColumns.has('audit_task_id')
      ? await resolveAuditTaskIdForEvidence(req.body)
      : null;
    const inserted = [];

    for (const file of files) {
      const cols = [];
      const vals = [];
      if (evidenceColumns.has('audit_task_id')) {
        cols.push('audit_task_id');
        vals.push(auditTaskId);
      }
      if (evidenceColumns.has('checklist_item_id')) {
        cols.push('checklist_item_id');
        vals.push(req.body.checklist_item_id || null);
      }
      if (evidenceColumns.has('evidence_type')) {
        cols.push('evidence_type');
        vals.push(inferEvidenceType({
          evidence_type: req.body.evidence_type,
          file_type: file?.mimetype,
          file_name: file?.originalname
        }));
      }
      cols.push('file_name');
      vals.push(file.originalname);
      cols.push('file_path');
      vals.push(`/uploads/${file.filename}`);
      if (evidenceColumns.has('file_type')) {
        cols.push('file_type');
        vals.push(file.mimetype);
      }
      if (evidenceColumns.has('file_size')) {
        cols.push('file_size');
        vals.push(file.size);
      }
      if (evidenceColumns.has('description')) {
        cols.push('description');
        vals.push(req.body.description || '');
      }
      if (evidenceColumns.has('uploaded_by')) {
        cols.push('uploaded_by');
        vals.push(uploadedById);
      }
      if (evidenceColumns.has('evidence_references')) {
        cols.push('evidence_references');
        vals.push(req.body.evidence_references || '');
      }

      const placeholders = cols.map(() => '?').join(', ');
      const [result] = await db.execute(
        `INSERT INTO audit_evidence (${cols.join(', ')}) VALUES (${placeholders})`,
        vals
      );
      inserted.push({
        id: result.insertId,
        file_name: file.originalname,
        file_path: `/uploads/${file.filename}`,
        file_size: file.size
      });
    }

    return res.json({
      success: true,
      count: inserted.length,
      total_size: totalSize,
      files: inserted
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post('/api/audit-evidence', authenticateToken, async (req, res) => {
  try {
    const evidenceColumns = await getTableColumns('audit_evidence');
    const uploadedById = await resolveUploadedByUserId(req.body.uploaded_by, req.user.id);
    const cols = [];
    const vals = [];

    if (evidenceColumns.has('audit_task_id')) {
      cols.push('audit_task_id');
      vals.push(await resolveAuditTaskIdForEvidence(req.body));
    }
    if (evidenceColumns.has('checklist_item_id')) {
      cols.push('checklist_item_id');
      vals.push(req.body.checklist_item_id || null);
    }
    if (evidenceColumns.has('evidence_type')) {
      cols.push('evidence_type');
      vals.push(inferEvidenceType({
        evidence_type: req.body.evidence_type,
        file_type: req.body.file_type,
        file_name: req.body.file_name,
        file_path: req.body.file_path
      }));
    }
    cols.push('file_name');
    vals.push(req.body.file_name);
    cols.push('file_path');
    vals.push(req.body.file_path);
    if (evidenceColumns.has('file_type')) {
      cols.push('file_type');
      vals.push(req.body.file_type || 'application/octet-stream');
    }
    if (evidenceColumns.has('file_size')) {
      cols.push('file_size');
      vals.push(req.body.file_size || 0);
    }
    if (evidenceColumns.has('description')) {
      cols.push('description');
      vals.push(req.body.description || '');
    }
    if (evidenceColumns.has('uploaded_by')) {
      cols.push('uploaded_by');
      vals.push(uploadedById);
    }
    if (evidenceColumns.has('evidence_references')) {
      cols.push('evidence_references');
      vals.push(req.body.evidence_references || '');
    }

    const placeholders = cols.map(() => '?').join(', ');
    const [result] = await db.execute(
      `INSERT INTO audit_evidence (${cols.join(', ')}) VALUES (${placeholders})`,
      vals
    );
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/audit-evidence/:id', authenticateToken, async (req, res) => {
  try {
    const evidenceColumns = await getTableColumns('audit_evidence');
    const uploadedById = await resolveUploadedByUserId(req.body.uploaded_by, req.user.id);
    const updates = [];
    const vals = [];

    if (evidenceColumns.has('audit_task_id')) { updates.push('audit_task_id = ?'); vals.push(await resolveAuditTaskIdForEvidence(req.body)); }
    if (evidenceColumns.has('checklist_item_id')) { updates.push('checklist_item_id = ?'); vals.push(req.body.checklist_item_id || null); }
    if (evidenceColumns.has('evidence_type')) {
      updates.push('evidence_type = ?');
      vals.push(inferEvidenceType({
        evidence_type: req.body.evidence_type,
        file_type: req.body.file_type,
        file_name: req.body.file_name,
        file_path: req.body.file_path
      }));
    }
    updates.push('file_name = ?'); vals.push(req.body.file_name);
    updates.push('file_path = ?'); vals.push(req.body.file_path);
    if (evidenceColumns.has('file_type')) { updates.push('file_type = ?'); vals.push(req.body.file_type || 'application/octet-stream'); }
    if (evidenceColumns.has('file_size')) { updates.push('file_size = ?'); vals.push(req.body.file_size || 0); }
    if (evidenceColumns.has('description')) { updates.push('description = ?'); vals.push(req.body.description || ''); }
    if (evidenceColumns.has('uploaded_by')) { updates.push('uploaded_by = ?'); vals.push(uploadedById); }
    if (evidenceColumns.has('evidence_references')) { updates.push('evidence_references = ?'); vals.push(req.body.evidence_references || ''); }

    vals.push(req.params.id);
    await db.execute(`UPDATE audit_evidence SET ${updates.join(', ')} WHERE id = ?`, vals);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/audit-evidence/:id', authenticateToken, async (req, res) => {
  const [rows] = await db.execute('SELECT file_path FROM audit_evidence WHERE id = ?', [req.params.id]);
  if (rows.length && rows[0].file_path && rows[0].file_path.startsWith('/uploads/')) {
    try {
      await fsp.unlink(path.join(__dirname, rows[0].file_path));
    } catch (_error) {
      // Ignore missing files.
    }
  }
  await db.execute('DELETE FROM audit_evidence WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/audits/:id/compliance', authenticateToken, async (req, res) => {
  const [rows] = await db.execute(
    `SELECT
      COUNT(*) AS total_controls,
      SUM(CASE WHEN compliance_status = 'Compliant' THEN 1 ELSE 0 END) AS compliant_controls,
      SUM(CASE WHEN compliance_status = 'Partially Compliant' THEN 1 ELSE 0 END) AS partial_controls,
      SUM(CASE WHEN compliance_status = 'Non-Compliant' THEN 1 ELSE 0 END) AS non_compliant_controls
     FROM audit_checklist
     WHERE audit_task_id = ?`,
    [req.params.id]
  );
  const row = rows[0] || {};
  const compliance_score = toCompliancePercent(row);
  res.json({ ...row, compliance_score });
});

app.get('/api/compliance-scores', authenticateToken, async (_req, res) => {
  const [rows] = await db.execute(`
    SELECT cs.*, o.name AS organization_name
    FROM compliance_scores cs
    LEFT JOIN organizations o ON o.id = cs.organization_id
    ORDER BY cs.assessment_date DESC, cs.id DESC
  `);
  const orgCache = new Map();
  const normalized = [];
  for (const row of rows) {
    const orgId = Number(row.organization_id || 0);
    if (!orgCache.has(orgId)) {
      orgCache.set(orgId, await getOrganizationComplianceStats(orgId));
    }
    const stats = orgCache.get(orgId);
    const storedCompliant = Number(row.compliant_controls);
    const storedTotal = Number(row.total_controls);
    const hasStoredManual = Number.isFinite(storedCompliant) && storedCompliant >= 0 && Number.isFinite(storedTotal) && storedTotal > 0;
    const storedPercentage = Number(row.compliance_percentage);
    const derivedStoredPercentage = hasStoredManual
      ? (Number.isFinite(storedPercentage) && storedPercentage >= 0
          ? storedPercentage
          : Number(((storedCompliant / storedTotal) * 100).toFixed(2)))
      : null;
    normalized.push({
      ...row,
      compliant_controls: hasStoredManual ? storedCompliant : stats.compliant_controls,
      total_controls: hasStoredManual ? storedTotal : stats.total_controls,
      compliance_percentage: hasStoredManual ? derivedStoredPercentage : stats.compliance_percentage,
      access_control_score: Number(row.access_control_score || 0),
      cryptography_score: Number(row.cryptography_score || 0),
      physical_security_score: Number(row.physical_security_score || 0),
      operations_security_score: Number(row.operations_security_score || 0),
      communications_security_score: Number(row.communications_security_score || 0),
      system_acquisition_score: Number(row.system_acquisition_score || 0),
      supply_chain_score: Number(row.supply_chain_score || 0),
      incident_management_score: Number(row.incident_management_score || 0)
    });
  }
  res.json({ data: normalized });
});

app.get('/api/compliance-scores/organization/:organizationId/summary', authenticateToken, async (req, res) => {
  const stats = await getOrganizationComplianceStats(req.params.organizationId);
  res.json({ data: stats });
});

app.post('/api/compliance-scores', authenticateToken, async (req, res) => {
  const complianceColumns = await getTableColumns('compliance_scores');
  const organizationId = Number(req.body.organization_id || req.user.organization_id || 0);
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    return res.status(400).json({ error: 'Valid organization is required' });
  }

  const cols = [];
  const vals = [];
  if (complianceColumns.has('organization_id')) { cols.push('organization_id'); vals.push(organizationId); }
  if (complianceColumns.has('audit_task_id')) { cols.push('audit_task_id'); vals.push(req.body.audit_task_id || null); }
  if (complianceColumns.has('assessment_date')) {
    cols.push('assessment_date');
    vals.push(req.body.assessment_date || new Date().toISOString().slice(0, 10));
  }
  const autoStats = await getOrganizationComplianceStats(organizationId);
  const manualCompliant = Number(req.body.compliant_controls);
  const manualTotal = Number(req.body.total_controls);
  const hasManualScore = Number.isFinite(manualCompliant) && manualCompliant >= 0 && Number.isFinite(manualTotal) && manualTotal > 0;
  const manualPercentageRaw = Number(req.body.compliance_percentage);
  const resolvedManualPercentage = hasManualScore
    ? (Number.isFinite(manualPercentageRaw) && manualPercentageRaw >= 0
        ? manualPercentageRaw
        : Number(((manualCompliant / manualTotal) * 100).toFixed(2)))
    : autoStats.compliance_percentage;

  if (complianceColumns.has('overall_score')) { cols.push('overall_score'); vals.push(resolvedManualPercentage); }
  if (complianceColumns.has('compliant_controls')) { cols.push('compliant_controls'); vals.push(hasManualScore ? manualCompliant : Number(autoStats.compliant_controls || 0)); }
  if (complianceColumns.has('total_controls')) { cols.push('total_controls'); vals.push(hasManualScore ? manualTotal : Number(autoStats.total_controls || 0)); }
  if (complianceColumns.has('compliance_percentage')) { cols.push('compliance_percentage'); vals.push(resolvedManualPercentage); }

  const scoreFields = [
    'access_control_score',
    'cryptography_score',
    'physical_security_score',
    'operations_security_score',
    'communications_security_score',
    'system_acquisition_score',
    'supply_chain_score',
    'incident_management_score'
  ];
  for (const field of scoreFields) {
    if (complianceColumns.has(field)) {
      cols.push(field);
      vals.push(Number(req.body[field] || 0));
    }
  }

  if (complianceColumns.has('recommendations')) { cols.push('recommendations'); vals.push(req.body.recommendations || ''); }

  const placeholders = cols.map(() => '?').join(', ');
  const [result] = await db.execute(
    `INSERT INTO compliance_scores (${cols.join(', ')}) VALUES (${placeholders})`,
    vals
  );
  res.json({ success: true, id: result.insertId });
});

app.put('/api/compliance-scores/:id', authenticateToken, async (req, res) => {
  const complianceColumns = await getTableColumns('compliance_scores');
  const organizationId = Number(req.body.organization_id || req.user.organization_id || 0);
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    return res.status(400).json({ error: 'Valid organization is required' });
  }

  const updates = [];
  const vals = [];
  if (complianceColumns.has('organization_id')) { updates.push('organization_id = ?'); vals.push(organizationId); }
  if (complianceColumns.has('audit_task_id')) { updates.push('audit_task_id = ?'); vals.push(req.body.audit_task_id || null); }
  if (complianceColumns.has('assessment_date')) {
    updates.push('assessment_date = ?');
    vals.push(req.body.assessment_date || new Date().toISOString().slice(0, 10));
  }
  const autoStats = await getOrganizationComplianceStats(organizationId);
  const manualCompliant = Number(req.body.compliant_controls);
  const manualTotal = Number(req.body.total_controls);
  const hasManualScore = Number.isFinite(manualCompliant) && manualCompliant >= 0 && Number.isFinite(manualTotal) && manualTotal > 0;
  const manualPercentageRaw = Number(req.body.compliance_percentage);
  const resolvedManualPercentage = hasManualScore
    ? (Number.isFinite(manualPercentageRaw) && manualPercentageRaw >= 0
        ? manualPercentageRaw
        : Number(((manualCompliant / manualTotal) * 100).toFixed(2)))
    : autoStats.compliance_percentage;

  if (complianceColumns.has('overall_score')) { updates.push('overall_score = ?'); vals.push(resolvedManualPercentage); }
  if (complianceColumns.has('compliant_controls')) { updates.push('compliant_controls = ?'); vals.push(hasManualScore ? manualCompliant : Number(autoStats.compliant_controls || 0)); }
  if (complianceColumns.has('total_controls')) { updates.push('total_controls = ?'); vals.push(hasManualScore ? manualTotal : Number(autoStats.total_controls || 0)); }
  if (complianceColumns.has('compliance_percentage')) { updates.push('compliance_percentage = ?'); vals.push(resolvedManualPercentage); }

  const scoreFields = [
    'access_control_score',
    'cryptography_score',
    'physical_security_score',
    'operations_security_score',
    'communications_security_score',
    'system_acquisition_score',
    'supply_chain_score',
    'incident_management_score'
  ];
  for (const field of scoreFields) {
    if (complianceColumns.has(field)) {
      updates.push(`${field} = ?`);
      vals.push(Number(req.body[field] || 0));
    }
  }

  if (complianceColumns.has('recommendations')) { updates.push('recommendations = ?'); vals.push(req.body.recommendations || ''); }
  vals.push(req.params.id);
  await db.execute(`UPDATE compliance_scores SET ${updates.join(', ')} WHERE id = ?`, vals);
  res.json({ success: true });
});

app.delete('/api/compliance-scores/:id', authenticateToken, async (req, res) => {
  await db.execute('DELETE FROM compliance_scores WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/audit-findings', authenticateToken, async (_req, res) => {
  const findingColumns = await getTableColumns('audit_findings');
  const hasOrganizationId = findingColumns.has('organization_id');
  const hasCreatedAt = findingColumns.has('created_at');
  const orderBy = hasCreatedAt ? 'af.created_at DESC' : 'af.id DESC';

  const query = hasOrganizationId
    ? `SELECT af.*, o.name AS organization_name
       FROM audit_findings af
       LEFT JOIN organizations o ON o.id = af.organization_id
       ORDER BY ${orderBy}`
    : `SELECT af.*, at.organization_id AS derived_organization_id, o.name AS organization_name
       FROM audit_findings af
       LEFT JOIN audit_tasks at ON at.id = af.audit_task_id
       LEFT JOIN organizations o ON o.id = at.organization_id
       ORDER BY ${orderBy}`;

  const [rows] = await db.execute(query);
  const normalized = rows.map((row) => ({
    ...row,
    organization_id: row.organization_id || row.derived_organization_id || null,
    issue: row.issue || row.title || row.description || '',
    risk: row.risk || row.risk_level || 'Medium',
    affected_asset: row.affected_asset || 'Control Environment',
    recommendation: row.recommendation || '',
    status: row.status || 'Open',
    category: row.category || 'Security',
    finding_date: row.finding_date || null,
    due_date: row.due_date || null,
    assigned_to: row.assigned_to || '',
    evidence_references: row.evidence_references || ''
  }));
  res.json({ data: normalized });
});

app.get('/api/audits/:id/findings', authenticateToken, async (req, res) => {
  const [rows] = await db.execute('SELECT * FROM audit_findings WHERE audit_task_id = ? ORDER BY created_at DESC', [req.params.id]);
  res.json({ data: rows });
});

app.post('/api/audits/:id/findings', authenticateToken, async (req, res) => {
  const payload = req.body || {};
  const findingColumns = await getTableColumns('audit_findings');
  const [auditRows] = await db.execute('SELECT organization_id FROM audit_tasks WHERE id = ?', [req.params.id]);
  const organization_id = auditRows[0]?.organization_id || null;
  const cols = [];
  const vals = [];

  if (findingColumns.has('audit_task_id')) {
    cols.push('audit_task_id');
    vals.push(await resolveAuditTaskIdForFinding(payload, req.params.id));
  }
  if (findingColumns.has('organization_id')) { cols.push('organization_id'); vals.push(organization_id); }
  if (findingColumns.has('title')) { cols.push('title'); vals.push(payload.title || 'Security Finding'); }
  if (findingColumns.has('issue')) { cols.push('issue'); vals.push(payload.issue || payload.title || 'Issue identified'); }
  if (findingColumns.has('risk')) { cols.push('risk'); vals.push(payload.risk || payload.risk_level || 'Medium'); }
  if (findingColumns.has('description')) { cols.push('description'); vals.push(payload.description || ''); }
  if (findingColumns.has('risk_level')) { cols.push('risk_level'); vals.push(payload.risk_level || 'Medium'); }
  if (findingColumns.has('category')) { cols.push('category'); vals.push(payload.category || 'Security'); }
  if (findingColumns.has('affected_asset')) { cols.push('affected_asset'); vals.push(payload.affected_asset || ''); }
  if (findingColumns.has('recommendation')) { cols.push('recommendation'); vals.push(payload.recommendation || ''); }
  if (findingColumns.has('status')) { cols.push('status'); vals.push(payload.status || 'Open'); }
  if (findingColumns.has('finding_date')) { cols.push('finding_date'); vals.push(payload.finding_date || new Date().toISOString().slice(0, 10)); }
  if (findingColumns.has('due_date')) { cols.push('due_date'); vals.push(payload.due_date || null); }
  if (findingColumns.has('assigned_to')) { cols.push('assigned_to'); vals.push(payload.assigned_to || ''); }
  if (findingColumns.has('evidence_references')) { cols.push('evidence_references'); vals.push(payload.evidence_references || ''); }
  if (findingColumns.has('ai_generated')) { cols.push('ai_generated'); vals.push(payload.ai_generated ? 1 : 0); }

  const placeholders = cols.map(() => '?').join(', ');
  const [result] = await db.execute(`INSERT INTO audit_findings (${cols.join(', ')}) VALUES (${placeholders})`, vals);
  res.json({ success: true, id: result.insertId });
});

app.post('/api/audit-findings', authenticateToken, async (req, res) => {
  const payload = req.body || {};
  const findingColumns = await getTableColumns('audit_findings');
  const cols = [];
  const vals = [];

  if (findingColumns.has('audit_task_id')) {
    cols.push('audit_task_id');
    vals.push(await resolveAuditTaskIdForFinding(payload));
  }
  if (findingColumns.has('organization_id')) {
    cols.push('organization_id');
    vals.push(payload.organization_id || req.user.organization_id || null);
  }
  if (findingColumns.has('title')) { cols.push('title'); vals.push(payload.title || 'Security Finding'); }
  if (findingColumns.has('issue')) { cols.push('issue'); vals.push(payload.issue || payload.title || 'Issue identified'); }
  if (findingColumns.has('risk')) { cols.push('risk'); vals.push(payload.risk || payload.risk_level || 'Medium'); }
  if (findingColumns.has('description')) { cols.push('description'); vals.push(payload.description || ''); }
  if (findingColumns.has('risk_level')) { cols.push('risk_level'); vals.push(payload.risk_level || 'Medium'); }
  if (findingColumns.has('category')) { cols.push('category'); vals.push(payload.category || 'Security'); }
  if (findingColumns.has('affected_asset')) { cols.push('affected_asset'); vals.push(payload.affected_asset || ''); }
  if (findingColumns.has('recommendation')) { cols.push('recommendation'); vals.push(payload.recommendation || ''); }
  if (findingColumns.has('status')) { cols.push('status'); vals.push(payload.status || 'Open'); }
  if (findingColumns.has('finding_date')) { cols.push('finding_date'); vals.push(payload.finding_date || new Date().toISOString().slice(0, 10)); }
  if (findingColumns.has('due_date')) { cols.push('due_date'); vals.push(payload.due_date || null); }
  if (findingColumns.has('assigned_to')) { cols.push('assigned_to'); vals.push(payload.assigned_to || ''); }
  if (findingColumns.has('evidence_references')) { cols.push('evidence_references'); vals.push(payload.evidence_references || ''); }
  if (findingColumns.has('ai_generated')) { cols.push('ai_generated'); vals.push(payload.ai_generated ? 1 : 0); }

  const placeholders = cols.map(() => '?').join(', ');
  const [result] = await db.execute(`INSERT INTO audit_findings (${cols.join(', ')}) VALUES (${placeholders})`, vals);
  res.json({ success: true, id: result.insertId });
});

app.put('/api/audit-findings/:id', authenticateToken, async (req, res) => {
  const payload = req.body || {};
  const findingColumns = await getTableColumns('audit_findings');
  const updates = [];
  const vals = [];

  if (findingColumns.has('audit_task_id')) { updates.push('audit_task_id = ?'); vals.push(await resolveAuditTaskIdForFinding(payload)); }
  if (findingColumns.has('organization_id')) { updates.push('organization_id = ?'); vals.push(payload.organization_id || req.user.organization_id || null); }
  if (findingColumns.has('title')) { updates.push('title = ?'); vals.push(payload.title || 'Security Finding'); }
  if (findingColumns.has('issue')) { updates.push('issue = ?'); vals.push(payload.issue || payload.title || 'Issue identified'); }
  if (findingColumns.has('risk')) { updates.push('risk = ?'); vals.push(payload.risk || payload.risk_level || 'Medium'); }
  if (findingColumns.has('description')) { updates.push('description = ?'); vals.push(payload.description || ''); }
  if (findingColumns.has('risk_level')) { updates.push('risk_level = ?'); vals.push(payload.risk_level || 'Medium'); }
  if (findingColumns.has('category')) { updates.push('category = ?'); vals.push(payload.category || 'Security'); }
  if (findingColumns.has('affected_asset')) { updates.push('affected_asset = ?'); vals.push(payload.affected_asset || ''); }
  if (findingColumns.has('recommendation')) { updates.push('recommendation = ?'); vals.push(payload.recommendation || ''); }
  if (findingColumns.has('status')) { updates.push('status = ?'); vals.push(payload.status || 'Open'); }
  if (findingColumns.has('finding_date')) { updates.push('finding_date = ?'); vals.push(payload.finding_date || new Date().toISOString().slice(0, 10)); }
  if (findingColumns.has('due_date')) { updates.push('due_date = ?'); vals.push(payload.due_date || null); }
  if (findingColumns.has('assigned_to')) { updates.push('assigned_to = ?'); vals.push(payload.assigned_to || ''); }
  if (findingColumns.has('evidence_references')) { updates.push('evidence_references = ?'); vals.push(payload.evidence_references || ''); }
  if (findingColumns.has('ai_generated')) { updates.push('ai_generated = ?'); vals.push(payload.ai_generated ? 1 : 0); }

  vals.push(req.params.id);
  await db.execute(`UPDATE audit_findings SET ${updates.join(', ')} WHERE id = ?`, vals);
  res.json({ success: true });
});

app.delete('/api/audit-findings/:id', authenticateToken, async (req, res) => {
  await db.execute('DELETE FROM audit_findings WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/findings/auto-generate', authenticateToken, async (req, res) => {
  const checklistColumns = await getTableColumns('audit_checklist');
  const findingColumns = await getTableColumns('audit_findings');

  if (!checklistColumns.has('compliance_status')) {
    return res.status(400).json({ error: 'Checklist table does not contain compliance status field' });
  }

  const [organizationRows] = await db.execute(
    'SELECT id, name, business_sector, exposure_level FROM organizations ORDER BY id ASC'
  );
  if (!organizationRows.length) {
    return res.status(400).json({ error: 'Please create at least one organization before auto-generating findings' });
  }

  const randomOrganization = () => organizationRows[Math.floor(Math.random() * organizationRows.length)];
  const riskToLevel = (riskText) => {
    const v = String(riskText || '').toLowerCase();
    if (v.includes('critical')) return 'Critical';
    if (v.includes('high')) return 'High';
    if (v.includes('low')) return 'Low';
    return 'Medium';
  };
  const statusOptions = ['Open', 'Open', 'Open', 'In Progress'];
  const randomStatus = () => statusOptions[Math.floor(Math.random() * statusOptions.length)];

  const statusExpr = 'ac.compliance_status';
  const controlIdExpr = checklistColumns.has('control_id')
    ? 'ac.control_id'
    : (checklistColumns.has('control_number') ? 'ac.control_number' : 'NULL');
  const controlNameExpr = checklistColumns.has('control_name')
    ? 'ac.control_name'
    : (checklistColumns.has('control_title') ? 'ac.control_title' : "'Control'");

  const params = [];
  let where = `${statusExpr} IN ('Non-Compliant', 'Partially Compliant', 'Partial')`;
  if (req.body?.audit_task_id && checklistColumns.has('audit_task_id')) {
    where += ' AND ac.audit_task_id = ?';
    params.push(Number(req.body.audit_task_id));
  }

  const [controls] = await db.execute(
    `SELECT
      ac.id AS checklist_id,
      ac.audit_task_id,
      ${controlIdExpr} AS control_id,
      ${controlNameExpr} AS control_name,
      ${statusExpr} AS compliance_status,
      at.organization_id
     FROM audit_checklist ac
     LEFT JOIN audit_tasks at ON at.id = ac.audit_task_id
     WHERE ${where}
     ORDER BY ac.id DESC`,
    params
  );

  // Also use real asset + vulnerability data to generate realistic findings.
  const [assetRiskRows] = await db.execute(
    `SELECT
      a.id AS asset_id,
      a.name AS asset_name,
      a.owner AS asset_owner,
      a.location AS asset_location,
      a.organization_id AS asset_organization_id,
      v.name AS vulnerability_name,
      v.category AS vulnerability_category,
      COALESCE(av.risk_level, 'Medium') AS risk_level,
      COALESCE(av.risk_score, 4) AS risk_score,
      COALESCE(av.description, v.description, '') AS details
     FROM asset_vulnerabilities av
     INNER JOIN assets a ON a.id = av.asset_id
     INNER JOIN vulnerabilities v ON v.id = av.vulnerability_id
     ORDER BY av.risk_score DESC, av.id DESC
     LIMIT 200`
  );

  const findingsToCreate = [];

  // Source 1: non-compliant checklist controls
  for (const control of controls) {
    const status = normalizeChecklistStatusForApi(control.compliance_status);
    const org = randomOrganization();
    const issue = `${control.control_id || 'Control'} ${control.control_name || 'Control'} is ${status}`;
    const risk = status === 'Non-Compliant'
      ? `High risk of control failure in ${org.business_sector || 'business'} operations`
      : `Medium risk due to partial control implementation`;
    const recommendation = `Implement corrective action for ${control.control_name || 'the control'}, validate with evidence, and schedule re-test.`;
    findingsToCreate.push({
      source: 'checklist',
      issue,
      risk,
      risk_level: status === 'Non-Compliant' ? 'High' : 'Medium',
      affected_asset: 'Control Environment',
      recommendation,
      category: 'Control Compliance',
      evidence_references: `Checklist Item #${control.checklist_id}`,
      organization_id: org.id
    });
  }

  // Source 2: real asset vulnerability risks
  for (const row of assetRiskRows) {
    const org = randomOrganization();
    const level = row.risk_level || 'Medium';
    const issue = `${row.asset_name || 'Asset'} is exposed to ${row.vulnerability_name || 'vulnerability'} (${row.vulnerability_category || 'Security'})`;
    const risk = `Potential ${String(level).toLowerCase()} impact on confidentiality/integrity/availability for ${row.asset_name || 'asset'}`;
    const recommendation = `Mitigate ${row.vulnerability_name || 'this vulnerability'} on ${row.asset_name || 'the asset'} by hardening configuration, patching, and validating remediation with evidence.`;
    findingsToCreate.push({
      source: 'asset_vulnerability',
      issue,
      risk,
      risk_level: riskToLevel(level),
      affected_asset: row.asset_name || 'Information Asset',
      recommendation,
      category: row.vulnerability_category || 'Threat & Vulnerability',
      evidence_references: row.details ? String(row.details).slice(0, 300) : '',
      organization_id: org.id
    });
  }

  // Keep generation size controlled and varied.
  const shuffled = findingsToCreate.sort(() => Math.random() - 0.5);
  const maxItems = Math.max(1, Math.min(30, Number(req.body?.limit || 12)));
  const selected = shuffled.slice(0, maxItems);

  let created = 0;
  const generated = [];
  for (const item of selected) {
    const orgId = Number(item.organization_id || 0);
    const auditTaskId = await getOrCreateLatestAuditTaskForOrganization(orgId);
    const issue = item.issue;
    const risk = item.risk;
    const riskLevel = item.risk_level || 'Medium';
    const recommendation = item.recommendation;
    const title = issue.length > 240 ? `${issue.slice(0, 237)}...` : issue;

    const cols = [];
    const vals = [];
    if (findingColumns.has('audit_task_id')) { cols.push('audit_task_id'); vals.push(auditTaskId); }
    if (findingColumns.has('organization_id')) { cols.push('organization_id'); vals.push(orgId || null); }
    if (findingColumns.has('title')) { cols.push('title'); vals.push(title); }
    if (findingColumns.has('issue')) { cols.push('issue'); vals.push(issue); }
    if (findingColumns.has('risk')) { cols.push('risk'); vals.push(risk); }
    if (findingColumns.has('description')) { cols.push('description'); vals.push(issue); }
    if (findingColumns.has('risk_level')) { cols.push('risk_level'); vals.push(riskLevel); }
    if (findingColumns.has('category')) { cols.push('category'); vals.push(item.category || 'Security'); }
    if (findingColumns.has('affected_asset')) { cols.push('affected_asset'); vals.push(item.affected_asset || 'Information Asset'); }
    if (findingColumns.has('recommendation')) { cols.push('recommendation'); vals.push(recommendation); }
    if (findingColumns.has('status')) { cols.push('status'); vals.push(randomStatus()); }
    if (findingColumns.has('finding_date')) { cols.push('finding_date'); vals.push(new Date().toISOString().slice(0, 10)); }
    if (findingColumns.has('assigned_to')) { cols.push('assigned_to'); vals.push(''); }
    if (findingColumns.has('evidence_references')) { cols.push('evidence_references'); vals.push(item.evidence_references || 'Auto-generated from historical audit data'); }
    if (findingColumns.has('ai_generated')) { cols.push('ai_generated'); vals.push(1); }

    const placeholders = cols.map(() => '?').join(', ');
    await db.execute(`INSERT INTO audit_findings (${cols.join(', ')}) VALUES (${placeholders})`, vals);
    created += 1;
    generated.push({
      issue,
      risk,
      affected_asset: item.affected_asset || 'Information Asset',
      recommendation,
      organization_id: orgId
    });
  }

  res.json({ success: true, created, data: generated });
});

app.post('/api/findings/generate', authenticateToken, async (req, res) => {
  const [controls] = await db.execute(
    `SELECT * FROM audit_checklist
     WHERE audit_task_id = ? AND compliance_status IN ('Non-Compliant', 'Partially Compliant')`,
    [req.body.audit_task_id]
  );
  const findings = controls.map((control) => ({
    issue: `${control.control_id || 'Control'} ${control.control_name} is ${control.compliance_status}`,
    risk: control.compliance_status === 'Non-Compliant' ? 'High' : 'Medium',
    affected_asset: 'Control Environment',
    recommendation: `Implement corrective action for ${control.control_name} and upload supporting evidence.`,
    source_control: control.id
  }));
  res.json({ data: findings });
});

function inferAssistantMode(query) {
  const q = String(query || '').toLowerCase();
  if (q.includes('sql injection') || q.includes('xss') || q.includes('phishing') || q.includes('vulnerability explain') || q.includes('漏洞解释') || q.includes('sql注入')) {
    return 'vulnerability_explainer'; // Module 10 - Option D
  }
  if (q.includes('executive summary') || q.includes('audit conclusion') || q.includes('report writer') || q.includes('write report') || q.includes('生成报告') || q.includes('报告总结')) {
    return 'report_writer'; // Module 10 - Option B
  }
  if (q.includes('mitigation') || q.includes('control recommendation') || q.includes('how to fix') || q.includes('recommend control') || q.includes('缓解') || q.includes('整改建议')) {
    return 'control_recommendation'; // Module 10 - Option C
  }
  return 'audit_advisor'; // Module 10 - Option A
}

function mapModeToStoredType(mode) {
  if (mode === 'vulnerability_explainer') return 'vulnerability_explanation';
  if (mode === 'control_recommendation') return 'control_recommendation';
  if (mode === 'report_writer') return 'risk_assessment';
  return 'audit_advice';
}

async function buildAiContextSnapshot() {
  const [[orgCount]] = await db.execute('SELECT COUNT(*) AS c FROM organizations');
  const [[assetCount]] = await db.execute('SELECT COUNT(*) AS c FROM assets');
  const [[findingCount]] = await db.execute('SELECT COUNT(*) AS c FROM audit_findings');
  const [[nonCompliantCount]] = await db.execute(
    `SELECT COUNT(*) AS c
     FROM audit_checklist
     WHERE compliance_status IN ('Non-Compliant', 'Partially Compliant', 'Partial')`
  );

  const [topVulns] = await db.execute(
    `SELECT v.name, COUNT(*) AS c
     FROM asset_vulnerabilities av
     INNER JOIN vulnerabilities v ON v.id = av.vulnerability_id
     GROUP BY v.name
     ORDER BY c DESC, v.name ASC
     LIMIT 5`
  );

  const [topFindings] = await db.execute(
    `SELECT title, risk_level
     FROM audit_findings
     ORDER BY created_at DESC
     LIMIT 5`
  );

  return {
    orgCount: Number(orgCount?.c || 0),
    assetCount: Number(assetCount?.c || 0),
    findingCount: Number(findingCount?.c || 0),
    nonCompliantCount: Number(nonCompliantCount?.c || 0),
    topVulns: topVulns || [],
    topFindings: topFindings || []
  };
}

function buildPromptForMode(mode, userQuery, snapshot) {
  const snapshotText = [
    `Organizations: ${snapshot.orgCount}`,
    `Assets: ${snapshot.assetCount}`,
    `Findings: ${snapshot.findingCount}`,
    `Non-compliant controls: ${snapshot.nonCompliantCount}`,
    `Top vulnerabilities: ${snapshot.topVulns.map((v) => `${v.name}(${v.c})`).join(', ') || 'None'}`,
    `Recent findings: ${snapshot.topFindings.map((f) => `${f.title || 'Untitled'}[${f.risk_level || 'Medium'}]`).join('; ') || 'None'}`
  ].join('\n');

  const modeInstructions = {
    audit_advisor:
      'Option A - AI Audit Advisor: Explain risk clearly and practically for audit users. Include why it matters and immediate next steps.',
    report_writer:
      'Option B - AI Report Writer: Write exactly 3 sections: Executive Summary, Audit Conclusion, Recommendations.',
    control_recommendation:
      'Option C - AI Control Recommendation: Provide mitigation/control steps with actionable bullets.',
    vulnerability_explainer:
      'Option D - AI Vulnerability Explainer: Explain SQL Injection, XSS, Phishing in non-technical management language when relevant.'
  };

  return [
    'You are an AI Auditor Assistant for a cybersecurity audit platform.',
    modeInstructions[mode] || modeInstructions.audit_advisor,
    'Keep response concise, practical, and mapped to OCTAVE Allegro risk-centric thinking.',
    'Use platform context to make response realistic.',
    '',
    'Platform Context:',
    snapshotText,
    '',
    `User Query: ${userQuery}`
  ].join('\n');
}

async function generateGeminiResponse(prompt) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) return null;
  // Free-tier friendly default
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      topP: 0.9,
      maxOutputTokens: 900
    }
  };

  const response = await axios.post(url, payload, { timeout: 20000 });
  const text = response.data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n') || '';
  return text.trim() || null;
}

async function generateOpenRouterFreeResponse(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY || '';
  if (!apiKey) return null;
  const model = process.env.OPENROUTER_MODEL || 'google/gemma-3-27b-it:free';
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 900
    },
    {
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:3001',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'AI Cybersecurity Platform'
      }
    }
  );
  const text = response.data?.choices?.[0]?.message?.content || '';
  return String(text).trim() || null;
}

function localAIResponse(query, mode, snapshot) {
  const q = String(query || '').trim();
  const ql = q.toLowerCase();
  const base = `Query: ${q}\nNon-compliant controls: ${snapshot.nonCompliantCount}\n`;
  if (mode === 'report_writer') {
    return `${base}Executive Summary:\nAudit posture indicates notable control gaps requiring prioritized remediation.\n\nAudit Conclusion:\nCurrent controls are partially effective; unresolved weaknesses may impact confidentiality, integrity, and availability.\n\nRecommendations:\n1. Close high-risk control gaps first.\n2. Enforce evidence-based remediation validation.\n3. Re-assess residual risk after fixes.`;
  }
  if (mode === 'control_recommendation') {
    return `${base}Recommended mitigation steps:\n1. Enforce MFA and account lockout after failed logins.\n2. Patch exposed services and validate configurations.\n3. Implement centralized logging and weekly review.\n4. Test backup restoration regularly.`;
  }
  if (mode === 'vulnerability_explainer') {
    return `${base}In simple terms:\n- SQL Injection: attackers can manipulate database queries and read/modify sensitive records.\n- XSS: attackers can run scripts in user browsers and steal session data.\n- Phishing: fake messages trick staff into revealing credentials.\nBusiness impact includes data leakage, service interruption, and reputational harm.`;
  }
  if (ql.includes('mitm') || ql.includes('man in the middle') || ql.includes('中间人')) {
    return `${base}MITM (Man-in-the-Middle) means an attacker secretly intercepts communication between two parties.\nRisks: credential theft, data tampering, session hijacking.\nMitigation: enforce HTTPS/TLS, certificate validation, MFA, secure Wi-Fi/VPN, and monitor anomalous traffic.`;
  }
  if (ql.includes('ransomware') || ql.includes('勒索')) {
    return `${base}Ransomware can encrypt critical systems and stop operations.\nPriority controls: offline tested backups, patching, least privilege, endpoint detection, and phishing-resistant MFA.`;
  }
  if (ql.includes('phishing') || ql.includes('钓鱼')) {
    return `${base}Phishing tricks users into revealing credentials or executing malware.\nControls: email filtering, security awareness training, MFA, domain protection (SPF/DKIM/DMARC), and rapid incident response playbooks.`;
  }
  return `${base}From an OCTAVE Allegro perspective, first identify affected information assets and containers, then assess threat likelihood and business impact.\nRecommended next steps:\n1. Identify the top affected asset.\n2. Define the threat scenario clearly.\n3. Score likelihood × impact.\n4. Apply high-priority controls and verify with evidence.`;
}

app.post('/api/ai/consult', authenticateToken, async (req, res) => {
  const query = String(req.body?.query || '').trim();
  if (!query) return res.status(400).json({ error: 'Query is required' });

  const mode = inferAssistantMode(query);
  const snapshot = await buildAiContextSnapshot();
  const prompt = buildPromptForMode(mode, query, snapshot);

  let provider = 'gemini';
  let responseText = null;
  try {
    responseText = await generateGeminiResponse(prompt);
  } catch (_e) {
    provider = 'openrouter';
  }
  if (!responseText) {
    try {
      responseText = await generateOpenRouterFreeResponse(prompt);
      if (responseText) provider = 'openrouter';
    } catch (_e) {
      provider = 'local';
    }
  }
  if (!responseText) {
    provider = 'local';
    responseText = localAIResponse(query, mode, snapshot);
  }

  const consultationType = mapModeToStoredType(mode);
  const [result] = await db.execute(
    'INSERT INTO ai_consultations (user_id, query, response, consultation_type) VALUES (?, ?, ?, ?)',
    [req.user.id, query, responseText, consultationType]
  );
  res.json({ success: true, id: result.insertId, response: responseText, mode, provider, consultation_type: consultationType });
});

app.get('/api/ai/consultations', authenticateToken, async (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const consultationType = String(req.query.consultation_type || '').trim();
  const isAdminAll = req.user.role === 'admin' && String(req.query.scope || '') === 'all';

  const whereParts = [];
  const params = [];

  if (!isAdminAll) {
    whereParts.push('ac.user_id = ?');
    params.push(req.user.id);
  }
  if (consultationType) {
    whereParts.push('ac.consultation_type = ?');
    params.push(consultationType);
  }
  const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const [rows] = await db.execute(
    `SELECT ac.*, u.full_name AS user_name
     FROM ai_consultations ac
     LEFT JOIN users u ON u.id = ac.user_id
     ${whereClause}
     ORDER BY ac.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [countRows] = await db.execute(
    `SELECT COUNT(*) AS total
     FROM ai_consultations ac
     ${whereClause}`,
    params
  );
  res.json({
    data: rows,
    total: Number(countRows[0]?.total || 0),
    limit,
    offset
  });
});

app.delete('/api/ai/consultations/me', authenticateToken, async (req, res) => {
  await db.execute('DELETE FROM ai_consultations WHERE user_id = ?', [req.user.id]);
  res.json({ success: true });
});

app.get('/api/reports', authenticateToken, async (_req, res) => {
  const [rows] = await db.execute(`
    SELECT r.*, o.name AS organization_name
    FROM reports r
    LEFT JOIN organizations o ON o.id = r.organization_id
    ORDER BY r.generated_date DESC
  `);
  res.json({ data: rows });
});

app.get('/api/reports/:id/download', authenticateToken, async (req, res) => {
  const reportColumns = await getTableColumns('reports');
  const hasFilePath = reportColumns.has('file_path');
  const hasOrganizationId = reportColumns.has('organization_id');
  const hasAuditTaskId = reportColumns.has('audit_task_id');
  const hasFormat = reportColumns.has('format');
  const selectFields = [
    ...(hasFilePath ? ['file_path'] : []),
    'file_name',
    ...(hasOrganizationId ? ['organization_id'] : []),
    ...(hasAuditTaskId ? ['audit_task_id'] : []),
    ...(hasFormat ? ['format'] : [])
  ];
  const selectQuery = `SELECT ${selectFields.join(', ')} FROM reports WHERE id = ?`;
  const [rows] = await db.execute(selectQuery, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Report not found' });

  const rawPath = hasFilePath
    ? rows[0]?.file_path
    : path.posix.join('reports', rows[0]?.file_name || '');
  const normalizedRelativePath = String(rawPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const absolutePath = path.resolve(__dirname, normalizedRelativePath);
  const allowedRoot = path.resolve(reportsDir);
  if (!absolutePath.startsWith(allowedRoot)) {
    return res.status(400).json({ error: 'Invalid report path' });
  }

  // Always rebuild report on download using platform-fixed framework,
  // so downloaded files always reflect the latest correct OCTAVE Allegro output.
  const organizationId = Number(rows[0]?.organization_id || 0);
  const auditTaskId = Number(rows[0]?.audit_task_id || 0);
  const formatFromDb = String(rows[0]?.format || '').toUpperCase();
  const extFormat = String(path.extname(rows[0]?.file_name || '')).replace('.', '').toUpperCase();
  const resolvedFormat = formatFromDb || extFormat || 'PDF';
  if (organizationId > 0) {
    const data = await buildReportPayload({
      organizationId,
      auditTaskId,
      selectedFramework: PLATFORM_FRAMEWORK
    });
    if (resolvedFormat === 'DOCX') {
      await generateDocxCompatibleReport(absolutePath, data);
    } else {
      await generatePdfReport(absolutePath, data);
    }
  }

  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ error: 'Report file missing on server' });
  }
  return res.download(absolutePath, rows[0]?.file_name || path.basename(absolutePath));
});

app.delete('/api/reports/:id', authenticateToken, async (req, res) => {
  const reportColumns = await getTableColumns('reports');
  const hasFilePath = reportColumns.has('file_path');
  const selectQuery = hasFilePath
    ? 'SELECT file_path, file_name FROM reports WHERE id = ?'
    : 'SELECT file_name FROM reports WHERE id = ?';
  const [rows] = await db.execute(selectQuery, [req.params.id]);
  const relPath = hasFilePath ? rows[0]?.file_path : path.join('reports', rows[0]?.file_name || '');
  if (rows.length && relPath) {
    try {
      await fsp.unlink(path.join(__dirname, relPath));
    } catch (_error) {
      // Ignore missing files.
    }
  }
  await db.execute('DELETE FROM reports WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

async function buildReportPayload({ organizationId, auditTaskId, selectedFramework }) {
  const [[organization]] = await db.execute('SELECT * FROM organizations WHERE id = ?', [organizationId]);
  const ensured = await ensureOrganizationReportBaselineData(organizationId, organization?.name);
  const preferredTaskId = Number(auditTaskId || 0) || Number(ensured?.auditTaskId || 0);
  let audit = null;
  if (Number(preferredTaskId) > 0) {
    const [rows] = await db.execute(
      `SELECT at.*, u.full_name AS auditor_name
       FROM audit_tasks at
       LEFT JOIN users u ON u.id = at.auditor_id
       WHERE at.id = ? AND at.organization_id = ?
       LIMIT 1`,
      [preferredTaskId, organizationId]
    );
    audit = rows[0] || null;
  }
  if (!audit && selectedFramework) {
    const [rows] = await db.execute(
      `SELECT at.*, u.full_name AS auditor_name
       FROM audit_tasks at
       LEFT JOIN users u ON u.id = at.auditor_id
       WHERE at.organization_id = ? AND at.framework = ?
       ORDER BY at.created_at DESC, at.id DESC
       LIMIT 1`,
      [organizationId, selectedFramework]
    );
    audit = rows[0] || null;
  }
  if (!audit) {
    const [rows] = await db.execute(
      `SELECT at.*, u.full_name AS auditor_name
       FROM audit_tasks at
       LEFT JOIN users u ON u.id = at.auditor_id
       WHERE at.organization_id = ?
       ORDER BY at.created_at DESC, at.id DESC
       LIMIT 1`,
      [organizationId]
    );
    audit = rows[0] || null;
  }

  const [checklist] = await db.execute(
    `SELECT ac.*
     FROM audit_checklist ac
     INNER JOIN audit_tasks at ON at.id = ac.audit_task_id
     WHERE at.organization_id = ?
     ORDER BY ac.id DESC`,
    [organizationId]
  );

  const findingColumns = await getTableColumns('audit_findings');
  const hasFindingOrganizationId = findingColumns.has('organization_id');
  const hasFindingAuditTaskId = findingColumns.has('audit_task_id');

  let findingsQuery = 'SELECT af.* FROM audit_findings af';
  const findingsParams = [];
  if (hasFindingAuditTaskId) {
    findingsQuery += ' LEFT JOIN audit_tasks at ON at.id = af.audit_task_id';
  }

  if (hasFindingOrganizationId && hasFindingAuditTaskId) {
    findingsQuery += ' WHERE af.organization_id = ? OR at.organization_id = ?';
    findingsParams.push(organizationId, organizationId);
  } else if (hasFindingOrganizationId) {
    findingsQuery += ' WHERE af.organization_id = ?';
    findingsParams.push(organizationId);
  } else if (hasFindingAuditTaskId) {
    findingsQuery += ' WHERE at.organization_id = ?';
    findingsParams.push(organizationId);
  }

  findingsQuery += ' ORDER BY af.id DESC';
  const [findings] = await db.execute(findingsQuery, findingsParams);
  const [assets] = await db.execute('SELECT * FROM assets WHERE organization_id = ? ORDER BY created_at DESC', [organizationId]);
  const [risks] = await db.execute(
    'SELECT * FROM octave_risk_assessments WHERE organization_id = ? ORDER BY risk_score DESC, created_at DESC',
    [organizationId]
  );
  const [[latestComplianceScore]] = await db.execute(
    `SELECT compliant_controls, total_controls, compliance_percentage
     FROM compliance_scores
     WHERE organization_id = ?
     ORDER BY assessment_date DESC, id DESC
     LIMIT 1`,
    [organizationId]
  );

  let compliance;
  if (latestComplianceScore) {
    const totalControls = Number(latestComplianceScore.total_controls || 0);
    const compliantControls = Number(latestComplianceScore.compliant_controls || 0);
    const percentageRaw = Number(latestComplianceScore.compliance_percentage);
    const score = Number.isFinite(percentageRaw) && percentageRaw >= 0
      ? percentageRaw
      : (totalControls > 0 ? Number(((compliantControls / totalControls) * 100).toFixed(2)) : 0);

    compliance = {
      total_controls: totalControls,
      compliant_controls: compliantControls,
      partial_controls: 0,
      non_compliant_controls: Math.max(0, totalControls - compliantControls),
      score
    };
  } else {
    const [[checklistCompliance]] = await db.execute(
      `SELECT
        COUNT(*) AS total_controls,
        SUM(CASE WHEN compliance_status = 'Compliant' THEN 1 ELSE 0 END) AS compliant_controls,
        SUM(CASE WHEN compliance_status = 'Partially Compliant' THEN 1 ELSE 0 END) AS partial_controls,
        SUM(CASE WHEN compliance_status = 'Non-Compliant' THEN 1 ELSE 0 END) AS non_compliant_controls
       FROM audit_checklist ac
       INNER JOIN audit_tasks at ON at.id = ac.audit_task_id
       WHERE at.organization_id = ?`,
      [organizationId]
    );
    compliance = {
      ...(checklistCompliance || {}),
      score: toCompliancePercent(checklistCompliance || {})
    };
  }

  const resolvedFramework = PLATFORM_FRAMEWORK;

  return {
    organization: organization || null,
    audit: audit ? { ...audit } : { framework: selectedFramework || null },
    framework: resolvedFramework,
    checklist,
    findings,
    assets,
    risks,
    compliance
  };
}

function resolveFinalAuditOpinion(score) {
  const value = Number(score || 0);
  if (value >= 85) return 'Secure';
  if (value >= 60) return 'Acceptable Risk';
  return 'Needs Immediate Action';
}

function buildAiRecommendations(data) {
  const recommendations = [];
  const complianceScore = Number(data?.compliance?.score || 0);
  const nonCompliantControls = Number(data?.compliance?.non_compliant_controls || 0);
  const highRisks = (data?.risks || []).filter((risk) =>
    ['High', 'Critical'].includes(String(risk?.risk_level || ''))
  );
  const topFinding = (data?.findings || [])[0];

  if (complianceScore < 85) {
    recommendations.push(
      `Raise compliance score from ${complianceScore}% to at least 85% by closing control gaps and validating remediation evidence.`
    );
  }
  if (nonCompliantControls > 0) {
    recommendations.push(
      `Prioritize remediation for ${nonCompliantControls} non-compliant control(s) and assign owners with target completion dates.`
    );
  }
  if (highRisks.length > 0) {
    recommendations.push(
      `Treat ${highRisks.length} high/critical risk scenario(s) first with immediate mitigation and weekly tracking.`
    );
  }
  if (topFinding) {
    recommendations.push(
      `Resolve top finding "${topFinding.title || topFinding.issue || 'Unnamed finding'}" and verify closure through retesting.`
    );
  }
  if (!recommendations.length) {
    recommendations.push('Maintain current controls, continue periodic monitoring, and preserve evidence for audit traceability.');
  }
  return recommendations.slice(0, 5);
}

async function generatePdfReport(reportPath, data) {
  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  const stream = fs.createWriteStream(reportPath);
  doc.pipe(stream);

  const generatedAt = new Date().toISOString();
  const framework = PLATFORM_FRAMEWORK;
  const complianceScore = Number(data.compliance?.score || 0);
  const finalOpinion = resolveFinalAuditOpinion(complianceScore);
  const aiRecommendations = buildAiRecommendations(data);
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const contentWidth = pageWidth - doc.page.margins.left - doc.page.margins.right;
  const bottomLimit = pageHeight - doc.page.margins.bottom - 24;
  const colors = {
    primary: '#3f51b5',
    primaryDark: '#2f3f94',
    text: '#1f2937',
    muted: '#5b6678',
    line: '#d7deea',
    card: '#f5f7fc',
    success: '#1f9d5f',
    warning: '#b26a00',
    danger: '#c23b3b'
  };
  let pageNo = 1;

  const drawPageChrome = () => {
    const left = doc.page.margins.left;
    const right = pageWidth - doc.page.margins.right;
    const currentY = doc.y;
    doc.save();
    doc.lineWidth(1).strokeColor(colors.line).moveTo(left, 32).lineTo(right, 32).stroke();
    doc.fontSize(9).fillColor(colors.muted).text('AI Cybersecurity Platform - Security Audit Report', left, 18, {
      lineBreak: false
    });
    doc.fontSize(9).fillColor(colors.muted).text(`Page ${pageNo}`, right - 48, 18, {
      lineBreak: false
    });
    doc.restore();
    doc.y = currentY;
  };

  doc.on('pageAdded', () => {
    pageNo += 1;
    drawPageChrome();
    doc.y = 56;
  });

  const ensureSpace = (needed = 40) => {
    if (doc.y + needed > bottomLimit) {
      doc.addPage();
    }
  };

  const sectionTitle = (index, title) => {
    ensureSpace(42);
    const x = doc.page.margins.left;
    const y = doc.y;
    doc.save();
    doc.roundedRect(x, y, contentWidth, 24, 6).fill(colors.card);
    doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(12).text(`${index}. ${title}`, x + 10, y + 6, { width: contentWidth - 20 });
    doc.restore();
    doc.y = y + 32;
  };

  const drawListItem = (text, opts = {}) => {
    ensureSpace(28);
    const x = doc.page.margins.left + (opts.indent || 0);
    const marker = opts.marker || '- ';
    doc.font('Helvetica').fontSize(opts.size || 10).fillColor(colors.text).text(`${marker}${text}`, x, doc.y, {
      width: contentWidth - (opts.indent || 0),
      lineGap: 2
    });
    doc.moveDown(0.25);
  };

  drawPageChrome();
  doc.y = 56;

  const bannerY = doc.y;
  doc.save();
  doc.roundedRect(doc.page.margins.left, bannerY, contentWidth, 84, 10).fill(colors.primary);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(21).text('Security Audit Report', doc.page.margins.left + 18, bannerY + 20);
  doc.font('Helvetica').fontSize(11).text('Module 11 - Report Generator', doc.page.margins.left + 18, bannerY + 50);
  doc.restore();
  doc.y = bannerY + 100;

  const infoY = doc.y;
  doc.save();
  doc.roundedRect(doc.page.margins.left, infoY, contentWidth, 110, 8).fill(colors.card);
  doc.restore();
  doc.font('Helvetica').fontSize(10).fillColor(colors.text);
  const col1X = doc.page.margins.left + 12;
  const col2X = doc.page.margins.left + (contentWidth / 2) + 8;
  const colWidth = (contentWidth / 2) - 22;
  doc.text(`Organization: ${data.organization?.name || 'N/A'}`, col1X, infoY + 12, { width: colWidth });
  doc.text(`Audit Title: ${data.audit?.title || 'N/A'}`, col1X, infoY + 36, { width: colWidth });
  doc.text(`Auditor: ${data.audit?.auditor_name || 'N/A'}`, col1X, infoY + 60, { width: colWidth });
  doc.text(`Framework: ${framework}`, col2X, infoY + 12, { width: colWidth });
  doc.text(`Generated At: ${generatedAt}`, col2X, infoY + 36, { width: colWidth });
  doc.text(`Compliance Score: ${complianceScore}%`, col2X, infoY + 60, { width: colWidth });
  doc.text(
    `Data Snapshot: Assets ${Number(data.assets?.length || 0)}, Risks ${Number(data.risks?.length || 0)}, Findings ${Number(data.findings?.length || 0)}, Controls ${Number(data.checklist?.length || 0)}`,
    col1X,
    infoY + 84,
    { width: contentWidth - 24 }
  );
  doc.y = infoY + 124;

  sectionTitle(1, 'Executive Summary');
  doc.font('Helvetica').fontSize(10.5).fillColor(colors.text).text(
    `This report summarizes the security audit results for ${data.organization?.name || 'N/A'}. ` +
      `Current compliance score is ${complianceScore}%, with ${Number(data.findings?.length || 0)} finding(s) and ${Number(data.risks?.length || 0)} risk item(s) identified.`,
    { width: contentWidth, lineGap: 2 }
  );
  doc.moveDown(0.6);

  sectionTitle(2, 'Scope of Audit');
  drawListItem('Organization profile, information assets, risk scenarios, control checklist results, and audit findings.');
  drawListItem(`Assets reviewed: ${Number(data.assets?.length || 0)}`);
  drawListItem(`Checklist controls reviewed: ${Number(data.checklist?.length || 0)}`);

  sectionTitle(3, 'Methodology (Selected Framework)');
  drawListItem(`Framework: ${framework}`);
  drawListItem('Risk model: Risk = Likelihood x Impact');

  sectionTitle(4, 'Asset List');
  if (!data.assets?.length) {
    drawListItem('No assets recorded.');
  } else {
    data.assets.forEach((asset, idx) => {
      drawListItem(
        `${idx + 1}. ${asset.name || 'Unnamed Asset'} | Type: ${asset.asset_class || 'N/A'} | CIA: ${asset.cia_value || 'N/A'} | Criticality: ${asset.criticality_score || 0}`
      );
    });
  }

  sectionTitle(5, 'Risk Assessment');
  if (!data.risks?.length) {
    drawListItem('No risk records available.');
  } else {
    data.risks.forEach((risk, idx) => {
      drawListItem(
        `${idx + 1}. ${risk.threat_scenario || 'Threat scenario'} | Likelihood: ${risk.likelihood || 'N/A'} | Impact: ${risk.impact || 'N/A'} | Score: ${risk.risk_score || 0} | Level: ${risk.risk_level || 'N/A'}`
      );
    });
  }

  sectionTitle(6, 'Compliance Result');
  drawListItem(`Total Controls: ${Number(data.compliance?.total_controls || 0)}`);
  drawListItem(`Compliant: ${Number(data.compliance?.compliant_controls || 0)}`);
  drawListItem(`Partially Compliant: ${Number(data.compliance?.partial_controls || 0)}`);
  drawListItem(`Non-Compliant: ${Number(data.compliance?.non_compliant_controls || 0)}`);
  drawListItem(`Compliance Score: ${complianceScore}%`);

  sectionTitle(7, 'Audit Findings');
  if (!data.findings?.length) {
    drawListItem('No findings recorded.');
  } else {
    data.findings.forEach((finding, idx) => {
      drawListItem(`${idx + 1}. ${finding.title || finding.issue || 'Finding'} [${finding.risk_level || 'Medium'}]`);
      drawListItem(`Issue: ${finding.issue || finding.description || 'N/A'}`, { indent: 14, marker: '' });
      drawListItem(`Affected Asset: ${finding.affected_asset || 'N/A'}`, { indent: 14, marker: '' });
      drawListItem(`Recommendation: ${finding.recommendation || 'N/A'}`, { indent: 14, marker: '' });
    });
  }

  sectionTitle(8, 'AI Recommendations');
  aiRecommendations.forEach((item, idx) => {
    drawListItem(`${idx + 1}. ${item}`);
  });

  sectionTitle(9, 'Final Audit Opinion');
  ensureSpace(78);
  const badgeColor = finalOpinion === 'Secure'
    ? colors.success
    : finalOpinion === 'Acceptable Risk'
      ? colors.warning
      : colors.danger;
  const opinionY = doc.y;
  doc.save();
  doc.roundedRect(doc.page.margins.left, opinionY, contentWidth, 56, 8).fill('#f8fafc');
  doc.roundedRect(doc.page.margins.left + 12, opinionY + 16, 210, 24, 12).fill(badgeColor);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text(`Selected: ${finalOpinion}`, doc.page.margins.left + 24, opinionY + 22);
  doc.restore();
  doc.font('Helvetica').fontSize(10).fillColor(colors.muted).text('Final Opinion Options: Secure | Acceptable Risk | Needs Immediate Action', doc.page.margins.left + 240, opinionY + 22, {
    width: contentWidth - 252
  });
  doc.y = opinionY + 66;

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function generateDocxCompatibleReport(reportPath, data) {
  const complianceScore = Number(data.compliance?.score || 0);
  const finalOpinion = resolveFinalAuditOpinion(complianceScore);
  const framework = PLATFORM_FRAMEWORK;
  const aiRecommendations = buildAiRecommendations(data);
  const lines = [
    'MODULE 11 - Report Generator',
    'Security Audit Report (DOCX)',
    '',
    '1. Executive Summary',
    `Audit organization: ${data.organization?.name || 'N/A'}`,
    `Audit title: ${data.audit?.title || 'N/A'}`,
    `Auditor: ${data.audit?.auditor_name || 'N/A'}`,
    `Overall compliance score: ${complianceScore}%`,
    `Findings count: ${Number(data.findings?.length || 0)}`,
    `Risk records count: ${Number(data.risks?.length || 0)}`,
    '',
    '2. Scope of audit',
    'Organization profile, assets, risk scenarios, control checklist status, and findings.',
    `Assets reviewed: ${Number(data.assets?.length || 0)}`,
    `Checklist controls reviewed: ${Number(data.checklist?.length || 0)}`,
    '',
    '3. Methodology (selected framework)',
    `Framework: ${framework}`,
    'Risk formula: Risk = Likelihood x Impact',
    '',
    '4. Asset list',
    `Organization: ${data.organization?.name || 'N/A'}`,
    `Audit Title: ${data.audit?.title || 'N/A'}`,
    `Generated At: ${new Date().toISOString()}`,
    '',
    '5. Risk assessment',
    '',
    '6. Compliance result',
    `Total Controls: ${data.compliance.total_controls || 0}`,
    `Compliant: ${data.compliance.compliant_controls || 0}`,
    `Partially Compliant: ${data.compliance.partial_controls || 0}`,
    `Non-Compliant: ${data.compliance.non_compliant_controls || 0}`,
    `Compliance Score: ${complianceScore}%`,
    '',
    '7. Audit findings'
  ];
  if (data.assets?.length) {
    for (const [index, asset] of data.assets.entries()) {
      lines.push(`${index + 1}. ${asset.name} | ${asset.asset_class || 'N/A'} | CIA: ${asset.cia_value || 'N/A'} | Criticality: ${asset.criticality_score || 0}`);
    }
  } else {
    lines.push('No assets recorded.');
  }
  lines.push('');
  if (data.risks?.length) {
    for (const [index, risk] of data.risks.entries()) {
      lines.push(`${index + 1}. ${risk.threat_scenario || 'Threat'} | Score ${risk.risk_score || 0} | ${risk.risk_level || 'N/A'}`);
    }
  } else {
    lines.push('No risk records available.');
  }
  lines.push('');
  for (const [index, finding] of data.findings.entries()) {
    lines.push(`${index + 1}. ${finding.title || finding.issue || 'Finding'} [${finding.risk_level}]`);
    lines.push(`Issue: ${finding.issue || finding.description || ''}`);
    lines.push(`Risk: ${finding.risk || finding.risk_level || ''}`);
    lines.push(`Affected Asset: ${finding.affected_asset || 'N/A'}`);
    lines.push(`Recommendation: ${finding.recommendation || 'N/A'}`);
    lines.push('');
  }
  lines.push('8. AI recommendations');
  for (const [index, recommendation] of aiRecommendations.entries()) {
    lines.push(`${index + 1}. ${recommendation}`);
  }
  lines.push('');
  lines.push('9. Final audit opinion');
  lines.push(`Selected: ${finalOpinion}`);
  lines.push('Final Opinion Options:');
  lines.push('- Secure');
  lines.push('- Acceptable Risk');
  lines.push('- Needs Immediate Action');
  await fsp.writeFile(reportPath, lines.join('\n'), 'utf8');
}

app.post('/api/reports/generate', authenticateToken, async (req, res) => {
  try {
    const format = (req.body.format || 'PDF').toUpperCase();
    const organizationId = Number(req.body.organization_id || req.user.organization_id || 1);
    const selectedFramework = PLATFORM_FRAMEWORK;
    let auditTaskId = Number(req.body.audit_task_id || 0);
    if (!auditTaskId) {
      if (selectedFramework) {
        const [frameworkAudits] = await db.execute(
          `SELECT id
           FROM audit_tasks
           WHERE organization_id = ? AND framework = ?
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
          [organizationId, selectedFramework]
        );
        auditTaskId = frameworkAudits[0]?.id || 0;
      }
      if (!auditTaskId) {
        const [latestAudits] = await db.execute(
          `SELECT id FROM audit_tasks WHERE organization_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
          [organizationId]
        );
        auditTaskId = latestAudits[0]?.id || 0;
      }
    }

    const data = await buildReportPayload({ organizationId, auditTaskId, selectedFramework });
    const fileBase = `${sanitizeFilename(data.organization?.name || 'organization')}-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const ext = format === 'DOCX' ? 'docx' : 'pdf';
    const fileName = `${fileBase}.${ext}`;
    const filePath = path.join(reportsDir, fileName);

    if (format === 'DOCX') await generateDocxCompatibleReport(filePath, data);
    else await generatePdfReport(filePath, data);

    const reportColumns = await getTableColumns('reports');
    const cols = [];
    const vals = [];
    const reportType = req.body.report_type || 'Security Audit';

    if (reportColumns.has('organization_id')) { cols.push('organization_id'); vals.push(organizationId); }
    if (reportColumns.has('audit_task_id')) { cols.push('audit_task_id'); vals.push(auditTaskId); }
    if (reportColumns.has('report_type')) { cols.push('report_type'); vals.push(reportType); }
    if (reportColumns.has('format')) { cols.push('format'); vals.push(format === 'DOCX' ? 'DOCX' : 'PDF'); }
    if (reportColumns.has('date_range')) { cols.push('date_range'); vals.push(req.body.date_range || 'Last 30 Days'); }
    if (reportColumns.has('generated_date')) { cols.push('generated_date'); vals.push(new Date().toISOString().slice(0, 10)); }
    if (reportColumns.has('file_name')) { cols.push('file_name'); vals.push(fileName); }
    if (reportColumns.has('file_path')) { cols.push('file_path'); vals.push(path.posix.join('reports', fileName)); }
    if (reportColumns.has('generated_by')) { cols.push('generated_by'); vals.push(req.user.email); }
    if (reportColumns.has('file_size')) {
      const stats = await fsp.stat(filePath);
      cols.push('file_size');
      vals.push(`${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
    }
    if (reportColumns.has('status')) { cols.push('status'); vals.push('Completed'); }

    const placeholders = cols.map(() => '?').join(', ');
    const [result] = await db.execute(`INSERT INTO reports (${cols.join(', ')}) VALUES (${placeholders})`, vals);
    res.json({ success: true, id: result.insertId, file_name: fileName, download_url: `/reports/${fileName}` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/dashboard/stats', authenticateToken, async (_req, res) => {
  const [[users]] = await db.execute('SELECT COUNT(*) AS count FROM users');
  const [[organizations]] = await db.execute('SELECT COUNT(*) AS count FROM organizations');
  const [[assets]] = await db.execute('SELECT COUNT(*) AS count FROM assets');
  const [[audits]] = await db.execute('SELECT COUNT(*) AS count FROM audit_tasks');
  const [[highRisk]] = await db.execute(`SELECT COUNT(*) AS count FROM octave_risk_assessments WHERE risk_level IN ('High', 'Critical')`);
  res.json({
    users: users.count,
    organizations: organizations.count,
    assets: assets.count,
    audits: audits.count,
    high_risk_items: highRisk.count
  });
});

app.get('/api/dashboard/auditor-stats', authenticateToken, authorize('auditor'), async (req, res) => {
  const [[audits]] = await db.execute('SELECT COUNT(*) AS count FROM audit_tasks WHERE auditor_id = ?', [req.user.id]);
  const [[completed]] = await db.execute(`SELECT COUNT(*) AS count FROM audit_tasks WHERE auditor_id = ? AND status = 'completed'`, [req.user.id]);
  const [[pendingReview]] = await db.execute(
    `SELECT COUNT(*) AS count
     FROM audit_tasks
     WHERE auditor_id = ?
       AND status IN ('pending', 'in_progress')`,
    [req.user.id]
  );
  const [[overdue]] = await db.execute(
    `SELECT COUNT(*) AS count
     FROM audit_tasks
     WHERE auditor_id = ?
       AND status <> 'completed'
       AND end_date IS NOT NULL
       AND DATE(end_date) < CURDATE()`,
    [req.user.id]
  );
  const [[findings]] = await db.execute(
    `SELECT COUNT(*) AS count
     FROM audit_findings af
     INNER JOIN audit_tasks at ON at.id = af.audit_task_id
     WHERE at.auditor_id = ?`,
    [req.user.id]
  );
  res.json({
    assigned_audits: audits.count,
    completed_audits: completed.count,
    pending_review: pendingReview.count,
    overdue_audits: overdue.count,
    findings: findings.count
  });
});

app.get('/api/dashboard/auditee-stats', authenticateToken, authorize('auditee'), async (req, res) => {
  const [[assets]] = await db.execute('SELECT COUNT(*) AS count FROM assets WHERE organization_id = ?', [req.user.organization_id]);
  const [[audits]] = await db.execute('SELECT COUNT(*) AS count FROM audit_tasks WHERE organization_id = ?', [req.user.organization_id]);
  const [[findings]] = await db.execute(
    `SELECT COUNT(*) AS count FROM audit_findings
     WHERE organization_id = ? AND status <> 'Resolved'`,
    [req.user.organization_id]
  );
  res.json({ assets: assets.count, audits: audits.count, open_findings: findings.count });
});

app.use(express.static(path.join(__dirname, 'client', 'build')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not Found' });
  return res.sendFile(path.join(__dirname, 'client', 'build', 'index.html'));
});

bootstrapDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`AI Cybersecurity OCTAVE Allegro platform running on http://localhost:${PORT}`);
      console.log('Default users: admin@cybersec.com / admin123, auditor@cybersec.com / auditor123, auditee@cybersec.com / auditee123');
    });
  })
  .catch((error) => {
    console.error('Database bootstrap failed:', error);
    process.exit(1);
  });

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
