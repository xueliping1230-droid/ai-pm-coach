const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ============================================================
// 配置（生产环境通过环境变量覆盖，见同目录 .env 说明）
// ============================================================
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'ai-pm-coach-dev-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@2026';
// DATA_DIR 优先读环境变量——在 Zeabur / Render / Fly.io 等 PaaS 上，把 Volume 挂载到这个绝对路径
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = __dirname;

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ============================================================
// JSON 文件持久化（原子写入：先写临时文件再 rename，防止写坏）
// ============================================================
let db = null;

function loadDB() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DATA_FILE)) {
        db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } else {
        db = seedDB();
        saveDB();
    }
    // 兼容：补全缺失字段
    if (!db.glossary) db.glossary = [];
    if (!db.quizSessions) db.quizSessions = [];
    if (!db.nextId.glossary) db.nextId.glossary = 1;
    if (!db.nextId.quizSessions) db.nextId.quizSessions = 1;
}

function saveDB() {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DATA_FILE);
}

function seedDB() {
    return {
        users: [
            {
                id: 1, username: 'admin',
                passwordHash: bcrypt.hashSync(ADMIN_PASSWORD, 10),
                role: 'admin', status: 'active',
                createdAt: '2026-09-22', lastLogin: null
            },
            {
                id: 2, username: 'viewer',
                passwordHash: bcrypt.hashSync('Viewer@2026', 10),
                role: 'viewer', status: 'active',
                createdAt: '2026-09-22', lastLogin: null
            }
        ],
        questions: [
            { id:1, num:1, dimension:'技术方案评估', difficulty:3, title:'RAG 优化策略', question:'在做 RAG 产品优化时，以下哪个做法最符合产品经理的思维方式？', options:['同时推进 Query 改写、重排序、生成优化等所有优化策略','先用离线评测定位瓶颈环节，针对性优化，验证在线效果','优先做技术难度最高的优化','根据算法同学的建议选择优化方向'], answer:'B', explanation:'B 是最佳答案。作为 PM，核心职责是发现瓶颈、对齐目标、驱动验证。' },
            { id:2, num:2, dimension:'问题诊断', difficulty:3, title:'RAG 难点与坑', question:'在 RAG 项目中遇到"知识库中有答案但检索失败"时，PM 应该如何优先处理？', options:['直接告诉算法同学"召回做得不好"，让他们优化算法','先分析失败 case，区分是"知识库缺失"还是"分块不当"还是"检索策略不匹配"','增加知识库数据量，确保更多问题都能被覆盖','立即优化向量数据库的查询效率'], answer:'B', explanation:'B 是最佳答案。问题诊断是解决问题的前提。' },
            { id:3, num:3, dimension:'产品设计', difficulty:3, title:'幻觉问题', question:'在处理 RAG 幻觉问题时，以下哪个方案最全面？', options:['只优化 Prompt，让模型更谨慎地生成','从源头控制、生成策略、监控反馈三个层面综合施策','直接拒绝回答置信度低的问题','增加知识库数据量'], answer:'B', explanation:'B 是最佳答案。幻觉是多因素导致的。' },
            { id:4, num:4, dimension:'技术方案评估', difficulty:3, title:'Chunks 有效信息分散', question:'在解决"chunks 有效信息分散"问题时，仅仅增大 Chunk Size 会带来什么风险？', options:['可能导致返回的上下文包含大量无关信息','会大幅提升召回成本','模型生成时会更容易幻觉','必然导致知识库无法更新'], answer:'A', explanation:'A 是最佳答案。盲目增大 Chunk Size 会引入大量无关信息。' },
            { id:5, num:5, dimension:'产品设计', difficulty:3, title:'Query 改写 vs 意图识别', question:'用户提问"怎么退订"，系统应该按以下哪个顺序处理最合适？', options:['先 Query 改写 → 然后去知识库检索','先意图识别 → 再针对该意图做 Query 改写 → 最后检索','同时做，选择效果最好的','直接去知识库检索'], answer:'B', explanation:'B 是最佳答案。意图决定了检索的方向。' },
            { id:6, num:6, dimension:'数据处理', difficulty:2, title:'知识库数据清洗', question:'在设计 RAG 知识库的数据清洗流程时，以下哪个步骤的顺序是最合理的？', options:['去除重复 → 去噪 → 结构化 → 质量评估 → 入库','去噪 → 去除重复 → 结构化 → 质量评估 → 入库','质量评估 → 去噪 → 去除重复 → 结构化 → 入库','入库 → 然后定期清洗'], answer:'B', explanation:'B 是最佳答案。先去噪再去重，符合数据处理逻辑。' },
            { id:7, num:7, dimension:'产品设计', difficulty:3, title:'RAG 长期记忆', question:'在验证"RAG 是否能有效改善长期记忆"时，以下哪个指标最能反映用户的真实体验？', options:['RAG 系统的召回准确率','用户在多轮对话中的留存率和重新激活率','模型生成的文本长度','向量库的查询速度'], answer:'B', explanation:'B 是最佳答案。留存率是衡量长期记忆效果的核心业务指标。' },
            { id:8, num:8, dimension:'性能优化', difficulty:2, title:'调用延时定位', question:'在 RAG 系统的总延迟中，以下哪个环节通常占比最大？', options:['用户输入到系统的网络延迟','LLM 生成回答的 token 生成时间','数据库查询的网络往返时间','模型推理前的数据预处理'], answer:'B', explanation:'B 是最佳答案。LLM 逐 token 生成通常占 60%-80%。' },
            { id:9, num:9, dimension:'参数调优', difficulty:2, title:'Top-K 参数', question:'在设置 RAG 的 Top-K 参数时，增加 Top-K 从 5 到 20 会带来什么权衡？', options:['只有好处：信息更全面','好处是召回率提升，但坏处是可能引入更多噪声','会导致性能下降，应该保持越小越好','与生成模型的能力无关'], answer:'B', explanation:'B 是最佳答案。Top-K 增大提升召回率的同时也引入噪声。' },
            { id:10, num:10, dimension:'架构设计', difficulty:3, title:'多路由架构', question:'在设计企业知识问答的架构时，为什么需要设置多个路由而不是用单一的 RAG？', options:['这样看起来更复杂','不同的问题类型需要不同的处理方式','为了占用更多的服务器资源','只是为了给面试官留下深刻印象'], answer:'B', explanation:'B 是最佳答案。FAQ 适合直接匹配，文档检索适合开放式问题。' },
            { id:11, num:11, dimension:'评测体系', difficulty:3, title:'模型效果评测流程', question:'在做模型效果评测时，以下哪个流程顺序最科学？', options:['直接做在线AB测试','离线评测定义标准 → 人工标注 → 离线验证 → 灰度上线 → AB测试 → 全量发布','用现成的公开数据集评测','让用户自己反馈'], answer:'B', explanation:'B 是最佳答案。从离线到在线的科学评测流程。' },
            { id:12, num:12, dimension:'产品机会识别', difficulty:2, title:'AI 赋能场景选择', question:'以下哪个场景最适合首先引入 AI 赋能？', options:['高频、规则明确、有大规模用户、AI 模型有成熟方案','技术最新、最炫酷的场景','用户投诉最多的场景','竞品已经做过的场景'], answer:'A', explanation:'A 是最佳答案。高频+规则明确+用户量大=ROI 最高。' },
            { id:13, num:13, dimension:'数据分析', difficulty:2, title:'数据口径与归因', question:'在说"问答率从60%提升到88%"时，最严谨的说法应该是什么？', options:['问答率提升了28个百分点','问答率提升了46.7%','先定义口径、说明分子分母、给出绝对提升和相对提升，最后归因','对比竞品'], answer:'C', explanation:'C 是最佳答案。严谨的数据表达需要先定义口径。' },
            { id:14, num:14, dimension:'工作流设计', difficulty:2, title:'Badcase 归因工作流', question:'在建立 Badcase 自动归因工作流时，以下哪个方案最完整？', options:['收集 → 手工分类 → 对接团队','收集 → LLM 自动分类 → 路由到改进 pipeline → 效果验证','直接加入训练集重新训练','不需要处理'], answer:'B', explanation:'B 是最佳答案。完整的闭环工作流。' },
            { id:15, num:15, dimension:'Agent 架构', difficulty:3, title:'Agent 演进方向', question:'Agent 从当前的"通用助手"演进到下一阶段，最可能的方向是什么？', options:['技术能力继续堆叠','从通用 → 垂直专家 + 多 Agent 协作，重点在可控性和可靠性','完全自主化','回归对话机器人'], answer:'B', explanation:'B 是最佳答案。垂直化+多 Agent 协作是真正的产品化路径。' },
            { id:16, num:16, dimension:'Agent 架构', difficulty:3, title:'Agent 幻觉工具调用', question:'当 Agent 因为"幻觉工具调用"而规划失败时，最直接的解决方案是什么？', options:['增加模型参数','用 CoT 引导逐步推理 + 工具描述规范化 + Fallback 策略','不用 Agent，用 Workflow 替代','增加训练数据'], answer:'B', explanation:'B 是最佳答案。CoT + 规范化 + Fallback 三管齐下。' },
            { id:17, num:17, dimension:'模型选型', difficulty:2, title:'指令模型 vs 推理模型', question:'对于"请帮我分析这份财务报表并给出投资建议"这个任务，应该用什么模型？', options:['指令模型，因为更快','推理模型，因为需要多步逻辑推理','都可以','混合模型'], answer:'B', explanation:'B 是最佳答案。分析财务报表需要多步推理。' },
            { id:18, num:18, dimension:'业务洞察', difficulty:2, title:'新业务上手', question:'新上手一个业务，最应该优先做什么？', options:['读所有的产品文档和数据报告','和核心干系人访谈，理解业务现状和问题','提出自己的改进方案','先观察用户'], answer:'B', explanation:'B 是最佳答案。干系人访谈才能理解真实业务现状。' }
        ],
        apiKeys: [
            { id:1, name:'DeepSeek 主密钥', type:'deepseek', keyValue:'sk-9c13733e50dd4a8ab50c7ace149a1f47', baseUrl:'https://api.deepseek.com', model:'deepseek-chat', category:'LLM查询', status:'active', createdBy:'admin', createdAt:'2026-09-22T10:00:00', updatedAt:'2026-09-22T10:00:00', expiresAt:null, usageCount:0, usageLimit:null }
        ],
        tokenRecords: [],
        operationLogs: [],
        glossary: [],
        quizSessions: [],
        nextId: { users: 3, questions: 19, apiKeys: 2, tokenRecords: 1, operationLogs: 1, glossary: 1, quizSessions: 1 }
    };
}

function genId(key) { return db.nextId[key]++; }
function publicUser(u) {
    return { id: u.id, username: u.username, role: u.role, status: u.status,
        createdAt: u.createdAt, lastLogin: u.lastLogin };
}

// ============================================================
// 中间件：JWT 认证
// ============================================================
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: '未登录' });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = db.users.find(u => u.id === payload.userId);
        if (!user || user.status !== 'active') return res.status(401).json({ error: '账号无效或已禁用' });
        req.user = user;
        next();
    } catch(e) {
        return res.status(401).json({ error: 'Token 无效或已过期' });
    }
}

function adminOnly(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    next();
}

// ============================================================
// 服务端操作日志（由后端在各接口内自动记录，前端不可伪造）
// ============================================================
function logAction(action, detail, userId) {
    db.operationLogs.push({
        id: genId('operationLogs'),
        userId: userId || null,
        action, detail,
        ip: '127.0.0.1',
        timestamp: new Date().toISOString()
    });
    saveDB();
}

// ============================================================
// API: 认证
// ============================================================
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
    const user = db.users.find(u => u.username === username);
    if (!user) return res.status(401).json({ error: '用户名或密码错误' });
    if (user.status !== 'active') return res.status(403).json({ error: '账号已禁用' });
    if (!bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ error: '用户名或密码错误' });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    user.lastLogin = new Date().toISOString();
    saveDB();
    logAction('login', (user.role === 'admin' ? '管理员' : '查看者') + '登录系统', user.id);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ id: req.user.id, username: req.user.username, role: req.user.role });
});

// 访客 token：测评页公开使用，自动签发，无需登录
app.post('/api/auth/guest', (req, res) => {
    let guest = db.users.find(u => u.username === 'guest');
    if (!guest) {
        guest = {
            id: genId('users'), username: 'guest',
            passwordHash: bcrypt.hashSync(require('crypto').randomBytes(16).toString('hex'), 10),
            role: 'viewer', status: 'active',
            createdAt: new Date().toISOString().slice(0, 10), lastLogin: null
        };
        db.users.push(guest);
        saveDB();
    }
    const token = jwt.sign({ userId: guest.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: guest.id, username: '访客用户', role: 'viewer' } });
});

// ============================================================
// API: 用户管理
// ============================================================
app.get('/api/users', authMiddleware, adminOnly, (req, res) => {
    res.json(db.users.filter(u => u.username !== 'guest').map(publicUser));
});

app.post('/api/users', authMiddleware, adminOnly, (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
    if (db.users.some(u => u.username === username)) return res.status(400).json({ error: '用户名已存在' });
    if (password.length < 8) return res.status(400).json({ error: '密码至少8位' });
    const user = {
        id: genId('users'), username,
        passwordHash: bcrypt.hashSync(password, 10),
        role: role === 'admin' ? 'admin' : 'viewer',
        status: 'active', createdAt: new Date().toISOString().slice(0, 10), lastLogin: null
    };
    db.users.push(user);
    saveDB();
    logAction('create', '新增用户: ' + username, req.user.id);
    res.json({ id: user.id });
});

app.put('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
    const u = db.users.find(x => x.id === parseInt(req.params.id));
    if (!u) return res.status(404).json({ error: '用户不存在' });
    const { role, status } = req.body;
    if (role) u.role = role;
    if (status) u.status = status;
    saveDB();
    logAction('edit', '编辑用户: ' + u.username, req.user.id);
    res.json({ ok: true });
});

app.patch('/api/users/:id/password', authMiddleware, adminOnly, (req, res) => {
    const u = db.users.find(x => x.id === parseInt(req.params.id));
    if (!u) return res.status(404).json({ error: '用户不存在' });
    const { password } = req.body;
    if (!password || password.length < 8) return res.status(400).json({ error: '密码至少8位' });
    u.passwordHash = bcrypt.hashSync(password, 10);
    saveDB();
    logAction('edit', '重置密码: ' + u.username, req.user.id);
    res.json({ ok: true });
});

app.delete('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
    const id = parseInt(req.params.id);
    if (id === 1) return res.status(400).json({ error: '不能删除默认管理员' });
    const u = db.users.find(x => x.id === id);
    db.users = db.users.filter(x => x.id !== id);
    saveDB();
    logAction('delete', '删除用户: ' + (u?.username || '#' + id), req.user.id);
    res.json({ ok: true });
});

// ============================================================
// API: 题库
// ============================================================
app.get('/api/questions', (req, res) => {
    const { dimension, difficulty } = req.query;
    let list = db.questions;
    if (dimension) list = list.filter(q => q.dimension === dimension);
    if (difficulty) list = list.filter(q => q.difficulty === parseInt(difficulty));
    res.json(list);
});

app.post('/api/questions', authMiddleware, adminOnly, (req, res) => {
    const q = req.body;
    if (!q.question || !q.options || q.options.length < 2) return res.status(400).json({ error: '题干和至少2个选项必填' });
    const newQ = { id: genId('questions'), num: q.num || db.questions.length + 1,
        dimension: q.dimension, difficulty: q.difficulty || 2,
        title: q.title || q.dimension, question: q.question,
        options: q.options, answer: q.answer, explanation: q.explanation || '' };
    db.questions.push(newQ);
    saveDB();
    logAction('create', '新增题目 #' + newQ.num, req.user.id);
    res.json({ id: newQ.id });
});

app.put('/api/questions/:id', authMiddleware, adminOnly, (req, res) => {
    const q = db.questions.find(x => x.id === parseInt(req.params.id));
    if (!q) return res.status(404).json({ error: '题目不存在' });
    Object.assign(q, req.body, { id: q.id });
    saveDB();
    logAction('edit', '编辑题目 #' + q.num, req.user.id);
    res.json({ ok: true });
});

app.delete('/api/questions/:id', authMiddleware, adminOnly, (req, res) => {
    const id = parseInt(req.params.id);
    const q = db.questions.find(x => x.id === id);
    db.questions = db.questions.filter(x => x.id !== id);
    saveDB();
    logAction('delete', '删除题目: ' + (q?.question?.slice(0, 20) || '#' + id), req.user.id);
    res.json({ ok: true });
});

app.post('/api/questions/import', authMiddleware, adminOnly, (req, res) => {
    const items = Array.isArray(req.body) ? req.body : req.body.questions;
    if (!Array.isArray(items)) return res.status(400).json({ error: '需要数组' });
    let count = 0;
    items.forEach(item => {
        db.questions.push({ id: genId('questions'), num: item.num || db.questions.length + 1,
            dimension: item.dimension, difficulty: item.difficulty || 2,
            title: item.title || item.dimension, question: item.question,
            options: item.options, answer: item.answer, explanation: item.explanation || '' });
        count++;
    });
    saveDB();
    logAction('import', '批量导入 ' + count + ' 题', req.user.id);
    res.json({ count });
});

// ============================================================
// API: API 密钥管理
// ============================================================
app.get('/api/apikeys', authMiddleware, adminOnly, (req, res) => {
    const list = db.apiKeys.map(k => ({
        ...k, keyValue: k.keyValue.slice(0, 4) + '****' + k.keyValue.slice(-4)
    }));
    res.json(list);
});

// 管理端查看单个密钥明文（仅 admin，用于复制）
app.get('/api/apikeys/:id/raw', authMiddleware, adminOnly, (req, res) => {
    const k = db.apiKeys.find(x => x.id === parseInt(req.params.id));
    if (!k) return res.status(404).json({ error: '密钥不存在' });
    res.json({ keyValue: k.keyValue });
});

app.post('/api/apikeys', authMiddleware, adminOnly, (req, res) => {
    const { name, type, keyValue, baseUrl, model, category, usageLimit, status } = req.body;
    if (!name || !keyValue) return res.status(400).json({ error: '名称和密钥值必填' });
    const k = { id: genId('apiKeys'), name, type: type || 'deepseek', keyValue,
        baseUrl: baseUrl || 'https://api.deepseek.com', model: model || 'deepseek-chat',
        category: category || '', status: status || 'active', createdBy: req.user.username,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        expiresAt: null, usageCount: 0, usageLimit: usageLimit || null };
    db.apiKeys.push(k);
    saveDB();
    logAction('create', '新增密钥: ' + name, req.user.id);
    res.json({ id: k.id });
});

app.put('/api/apikeys/:id', authMiddleware, adminOnly, (req, res) => {
    const k = db.apiKeys.find(x => x.id === parseInt(req.params.id));
    if (!k) return res.status(404).json({ error: '密钥不存在' });
    Object.assign(k, req.body, { id: k.id, updatedAt: new Date().toISOString() });
    saveDB();
    logAction('edit', '编辑密钥: ' + k.name, req.user.id);
    res.json({ ok: true });
});

app.patch('/api/apikeys/:id/status', authMiddleware, adminOnly, (req, res) => {
    const k = db.apiKeys.find(x => x.id === parseInt(req.params.id));
    if (!k) return res.status(404).json({ error: '密钥不存在' });
    k.status = k.status === 'active' ? 'disabled' : 'active';
    k.updatedAt = new Date().toISOString();
    saveDB();
    logAction('edit', (k.status === 'active' ? '启用' : '禁用') + '密钥: ' + k.name, req.user.id);
    res.json({ ok: true });
});

app.delete('/api/apikeys/:id', authMiddleware, adminOnly, (req, res) => {
    const id = parseInt(req.params.id);
    const k = db.apiKeys.find(x => x.id === id);
    db.apiKeys = db.apiKeys.filter(x => x.id !== id);
    saveDB();
    logAction('delete', '删除密钥: ' + (k?.name || '#' + id), req.user.id);
    res.json({ ok: true });
});

// ============================================================
// DeepSeek 代理（密钥只存后端，永不下发浏览器）
// ============================================================
function proxyDeepSeek(keyObj, messages, temperature = 0.3, maxTokens = 2000) {
    return new Promise((resolve, reject) => {
        const url = new URL('/v1/chat/completions', keyObj.baseUrl);
        const postData = JSON.stringify({
            model: keyObj.model, messages, temperature, max_tokens: maxTokens
        });
        const options = {
            hostname: url.hostname, path: url.pathname, method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + keyObj.keyValue,
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 30000
        };
        const req = https.request(options, (resp) => {
            let data = '';
            resp.on('data', chunk => data += chunk);
            resp.on('end', () => {
                try { resolve({ status: resp.statusCode, data: JSON.parse(data) }); }
                catch(e) { resolve({ status: resp.statusCode, data: { raw: data } }); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
        req.write(postData);
        req.end();
    });
}

app.post('/api/explain', authMiddleware, async (req, res) => {
    const { term, context } = req.body;
    if (!term) return res.status(400).json({ error: 'term 必填' });

    const keyObj = db.apiKeys.find(k => k.status === 'active');
    if (!keyObj) return res.status(503).json({ error: '未配置启用中的 API 密钥' });

    const messages = [
        { role: 'system', content: `你是一位资深的 AI 产品经理导师。请用通俗的语言解释用户给出的术语。
严格按以下结构输出：
1. 【一句话定义】简洁说明
2. 【通俗类比】用生活例子
3. 【核心要点】2-3 个关键点
4. 【PM 实际应用】在 AI 产品工作中的用处
5. 【相关概念】2-3 个关联术语

语言要通俗易懂，像和学生聊天一样。内容控制在 200-500 字。` },
        { role: 'user', content: (context ? '题目背景：' + context + '\n\n' : '') + '请解释术语："' + term + '"' }
    ];

    try {
        const result = await proxyDeepSeek(keyObj, messages, 0.7, 800);

        let tokensUsed = 0;
        if (result.data.usage) tokensUsed = result.data.usage.total_tokens;
        else tokensUsed = Math.round(JSON.stringify(messages).length / 4) + Math.round((result.data.choices?.[0]?.message?.content?.length || 200) / 4);

        db.tokenRecords.push({
            id: genId('tokenRecords'),
            userId: req.user.id, term,
            tokensUsed, model: keyObj.model, apiKeyName: keyObj.name,
            timestamp: new Date().toISOString()
        });
        keyObj.usageCount = (keyObj.usageCount || 0) + 1;
        saveDB();

        if (result.status !== 200) {
            return res.status(502).json({ error: 'LLM 调用失败', detail: result.data });
        }
        res.json({
            content: result.data.choices?.[0]?.message?.content || '',
            tokens: tokensUsed,
            model: keyObj.model
        });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================================
// API: Token 消费记录
// ============================================================
app.get('/api/tokens', authMiddleware, (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    let records = db.tokenRecords;
    if (req.query.userId) records = records.filter(r => r.userId === parseInt(req.query.userId));
    const list = records.slice().reverse().slice(0, limit).map(r => ({
        ...r, username: db.users.find(x => x.id === r.userId)?.username || '未知'
    }));
    res.json(list);
});

app.get('/api/tokens/stats', authMiddleware, (req, res) => {
    const records = db.tokenRecords;
    const total = records.reduce((s, r) => s + r.tokensUsed, 0);
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);
    res.json({
        total,
        today: records.filter(r => r.timestamp.startsWith(today)).reduce((s, r) => s + r.tokensUsed, 0),
        thisMonth: records.filter(r => r.timestamp.startsWith(thisMonth)).reduce((s, r) => s + r.tokensUsed, 0),
        count: records.length,
        avg: records.length ? Math.round(total / records.length) : 0
    });
});

// ============================================================
// API: 收藏词库（按用户隔离）
// ============================================================
app.get('/api/glossary', authMiddleware, (req, res) => {
    const list = db.glossary
        .filter(g => g.userId === req.user.id)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    res.json(list);
});

app.post('/api/glossary', authMiddleware, (req, res) => {
    const { term, explanation } = req.body;
    if (!term) return res.status(400).json({ error: 'term 必填' });
    let g = db.glossary.find(x => x.userId === req.user.id && x.term === term);
    if (g) {
        g.explanation = explanation;
        g.timestamp = new Date().toISOString();
    } else {
        g = { id: genId('glossary'), userId: req.user.id, term, explanation,
            timestamp: new Date().toISOString() };
        db.glossary.push(g);
    }
    saveDB();
    res.json(g);
});

app.delete('/api/glossary/:id', authMiddleware, (req, res) => {
    const id = parseInt(req.params.id);
    db.glossary = db.glossary.filter(g => !(g.id === id && g.userId === req.user.id));
    saveDB();
    res.json({ ok: true });
});

// ============================================================
// API: 账号总览（用户 + Token 消耗聚合）
// ============================================================
app.get('/api/accounts/overview', authMiddleware, adminOnly, (req, res) => {
    const list = db.users.filter(u => u.username !== 'guest').map(u => {
        const records = db.tokenRecords.filter(r => r.userId === u.id);
        return {
            id: u.id, username: u.username, role: u.role, status: u.status,
            lastLogin: u.lastLogin, createdAt: u.createdAt,
            tokenTotal: records.reduce((s, r) => s + r.tokensUsed, 0),
            queryCount: records.length
        };
    });
    res.json(list);
});

// ============================================================
// API: 操作日志
// ============================================================
app.get('/api/logs', authMiddleware, (req, res) => {
    const { action, userId, page = 1, pageSize = 20 } = req.query;
    let list = db.operationLogs.slice().reverse();
    if (action) list = list.filter(l => l.action === action);
    if (userId) list = list.filter(l => l.userId === parseInt(userId));
    const total = list.length;
    const paged = list.slice((page - 1) * pageSize, page * pageSize).map(l => ({
        ...l, username: db.users.find(x => x.id === l.userId)?.username || '系统'
    }));
    res.json({ total, page: parseInt(page), pageSize: parseInt(pageSize), items: paged });
});

// ============================================================
// API: 仪表盘统计
// ============================================================
app.get('/api/dashboard/stats', authMiddleware, (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);
    res.json({
        userCount: db.users.filter(u => u.username !== 'guest').length,
        questionCount: db.questions.length,
        activeKeyCount: db.apiKeys.filter(k => k.status === 'active').length,
        todayTokens: db.tokenRecords.filter(r => r.timestamp.startsWith(today)).reduce((s, r) => s + r.tokensUsed, 0),
        monthLogs: db.operationLogs.filter(l => l.timestamp.startsWith(thisMonth)).length,
        recentLogs: db.operationLogs.slice(-5).reverse().map(l => ({
            ...l, username: db.users.find(x => x.id === l.userId)?.username || '系统'
        })),
        tokenTrend7d: getTokenTrend(7)
    });
});

function getTokenTrend(days) {
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const ds = d.toISOString().slice(0, 10);
        result.push({
            date: ds,
            label: (d.getMonth() + 1) + '/' + d.getDate(),
            tokens: db.tokenRecords.filter(r => r.timestamp.startsWith(ds)).reduce((s, r) => s + r.tokensUsed, 0)
        });
    }
    return result;
}

// ============================================================
// 静态文件服务（前端页面与 API 同源部署）
// ============================================================
// 干净 URL 路由：/quiz → quiz.html, /admin → admin.html
app.get('/quiz', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'quiz.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

// 敏感文件/目录禁止通过 HTTP 访问（db.json 里有密钥和密码哈希）
const PUBLIC_HTML = new Set(['/', '/index.html', '/quiz.html', '/admin.html', '/quiz', '/admin']);
app.use((req, res, next) => {
    const p = decodeURIComponent(req.path).replace(/\\/g, '/');
    if (p.startsWith('/data/') || p.startsWith('/node_modules/') ||
        p.startsWith('/代码/') || p.startsWith('/文档/') || p.startsWith('/自测清单/') ||
        p.startsWith('/.trae/') || p.startsWith('/.git/') ||
        /\.(js|json|bat|md|map|ts|jsx|sh|log)$/i.test(p) ||
        p.includes('/.') ||
        (p.toLowerCase().endsWith('.html') && !PUBLIC_HTML.has(p))) {
        return res.status(403).json({ error: '禁止访问' });
    }
    next();
});

app.use(express.static(PUBLIC_DIR, {
    index: 'index.html',
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
}));

app.use((req, res) => res.status(404).json({ error: '接口不存在: ' + req.method + ' ' + req.url }));
app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    res.status(500).json({ error: '服务器内部错误', detail: err.message });
});

// ============================================================
// 启动
// ============================================================
loadDB();
app.listen(PORT, () => {
    console.log('');
    console.log('=================================================');
    console.log('  AI PM Coach 后端已启动');
    console.log('  前端页面:  http://localhost:' + PORT + '/');
    console.log('  API 地址:  http://localhost:' + PORT + '/api');
    console.log('  管理员:    admin / ' + (process.env.ADMIN_PASSWORD ? '(环境变量)' : ADMIN_PASSWORD));
    console.log('  数据库:    ' + DATA_FILE);
    console.log('=================================================');
    console.log('');
});
