// D1 (SQLite) so'rov qatlami. env.DB — D1Database binding (wrangler.toml'dagi "DB").
// Eski Postgres versiyasidan farqi: $1/$2 o'rniga pozitsion "?", RETURNING va
// ON CONFLICT...DO UPDATE sintaksisi deyarli bir xil ishlaydi (ikkalasi ham tekshirilgan).

export function makeQ(db) {
  const get = (sql, ...p) => db.prepare(sql).bind(...p).first();
  const all = (sql, ...p) => db.prepare(sql).bind(...p).all().then(r => r.results);
  const run = (sql, ...p) => db.prepare(sql).bind(...p).run();

  return {
    /* ── users ── */
    uById:      (id) => get('SELECT id,username,name,email,color,bio,avatar,banner,role,region_id,school_id,phone,is_banned,ban_reason,ban_expires_at,karma,followers,created_at FROM users WHERE id=?', id),
    uByIdFull:  (id) => get('SELECT * FROM users WHERE id=?', id),
    uByLogin:   (u) => get('SELECT * FROM users WHERE lower(username)=lower(?) OR lower(email)=lower(?)', u, u),
    uBySlug:    (p) => get('SELECT id,username,name,color,bio,avatar,banner,role,region_id,school_id,karma,followers,created_at FROM users WHERE lower(username)=lower(?) OR id=?', p, p),
    uByUsername:(u) => get('SELECT id,username,name,email FROM users WHERE lower(username)=lower(?)', u),
    uByTgId:    (tg) => get('SELECT id,username,name,email FROM users WHERE tg_id=?', tg),
    uSetTgId:   (tg_id, id) => run('UPDATE users SET tg_id=? WHERE id=?', tg_id, id),
    uSearch:    (p1, p2) => all('SELECT id,username,name,color,avatar,role FROM users WHERE lower(username) LIKE ? OR lower(name) LIKE ? LIMIT 20', p1, p2),
    uInsert:    (id, username, name, email, pass, color, region_id, school_id) =>
      run('INSERT INTO users(id,username,name,email,pass,color,region_id,school_id) VALUES(?,?,?,?,?,?,?,?)', id, username, name, email, pass, color, region_id || null, school_id || null),
    uExists:    (username, email) => get('SELECT id FROM users WHERE lower(username)=lower(?) OR lower(email)=lower(?)', username, email),
    uUpdProf:   (name, bio, id) => run('UPDATE users SET name=?,bio=? WHERE id=?', name, bio, id),
    uUpdEmail:  (email, id) => run('UPDATE users SET email=? WHERE id=?', email, id),
    uUpdPass:   (pass, id) => run('UPDATE users SET pass=? WHERE id=?', pass, id),
    uUpdAv:     (avatar, id) => run('UPDATE users SET avatar=? WHERE id=?', avatar, id),
    uUpdBanner: (banner, id) => run('UPDATE users SET banner=? WHERE id=?', banner, id),
    uAll:       () => all('SELECT id,username,name,email,color,avatar,role,is_banned,ban_reason,created_at FROM users ORDER BY created_at DESC LIMIT 200'),
    uBan:       (reason, expiresAt, id) => run('UPDATE users SET is_banned=1,ban_reason=?,ban_expires_at=? WHERE id=?', reason, expiresAt || null, id),
    uUnban:     (id) => run('UPDATE users SET is_banned=0,ban_reason=NULL,ban_expires_at=NULL WHERE id=?', id),
    uSetRole:   (role, id) => run('UPDATE users SET role=? WHERE id=?', role, id),

    /* ── regions / schools / categories ── */
    regionAll:    () => all('SELECT * FROM regions ORDER BY name'),
    regionGet:    (id) => get('SELECT * FROM regions WHERE id=?', id),
    schoolsByRegion: (region_id) => all('SELECT * FROM schools WHERE region_id=? ORDER BY name', region_id),
    schoolGet:    (id) => get('SELECT * FROM schools WHERE id=?', id),
    schoolFindByName: (region_id, name) => get('SELECT * FROM schools WHERE region_id=? AND lower(name)=lower(?)', region_id, name),
    schoolInsert: (id, region_id, name) => run('INSERT INTO schools(id,region_id,name) VALUES(?,?,?)', id, region_id, name),
    categoryAll:  () => all('SELECT * FROM categories ORDER BY name'),
    categoryGet:  (id) => get('SELECT * FROM categories WHERE id=?', id),

    /* ── problems (murojaatlar) ── */
    pInsert: (id, user_id, region_id, school_id, title, body, image) =>
      run('INSERT INTO problems(id,user_id,region_id,school_id,title,body,image) VALUES(?,?,?,?,?,?,?)', id, user_id, region_id || null, school_id || null, title, body, image || null),
    pOne:    (id) => get(`SELECT p.*,u.username,u.name as uname,u.color,u.avatar,
        c.title as cluster_title, c.status as cluster_status, cat.name as category_name, cat.color as category_color, cat.icon as category_icon,
        r.name as region_name, s.name as school_name
      FROM problems p JOIN users u ON p.user_id=u.id
      LEFT JOIN clusters c ON p.cluster_id=c.id
      LEFT JOIN categories cat ON p.category_id=cat.id
      LEFT JOIN regions r ON p.region_id=r.id
      LEFT JOIN schools s ON p.school_id=s.id
      WHERE p.id=?`, id),
    pByUser: (user_id) => all('SELECT p.*,cat.name as category_name, cat.color as category_color FROM problems p LEFT JOIN categories cat ON p.category_id=cat.id WHERE p.user_id=? AND p.is_deleted=0 ORDER BY p.created_at DESC LIMIT 50', user_id),
    pPendingAi: (limit) => all('SELECT * FROM problems WHERE ai_status=? ORDER BY created_at ASC LIMIT ?', 'pending', limit || 5),
    pSetCategory: (category_id, ai_status, id) => run('UPDATE problems SET category_id=?,ai_status=? WHERE id=?', category_id, ai_status, id),
    pSetCluster:  (cluster_id, id) => run('UPDATE problems SET cluster_id=? WHERE id=?', cluster_id, id),
    pDelete: (id) => run('UPDATE problems SET is_deleted=1 WHERE id=?', id),
    pOwner:  (id) => get('SELECT user_id, cluster_id FROM problems WHERE id=?', id),
    pSearch: (p1, p2) => all('SELECT p.*,u.username,u.color,u.avatar FROM problems p JOIN users u ON p.user_id=u.id WHERE p.is_deleted=0 AND (lower(p.title) LIKE ? OR lower(p.body) LIKE ?) ORDER BY p.created_at DESC LIMIT 20', p1, p2),

    /* ── clusters ── */
    clInsert: (id, category_id, region_id, school_id, title, summary) =>
      run('INSERT INTO clusters(id,category_id,region_id,school_id,title,summary,problem_count) VALUES(?,?,?,?,?,?,1)', id, category_id || null, region_id || null, school_id || null, title, summary || ''),
    clOne: (id) => get(`SELECT cl.*,cat.name as category_name,cat.color as category_color,cat.icon as category_icon,
        r.name as region_name, s.name as school_name
      FROM clusters cl LEFT JOIN categories cat ON cl.category_id=cat.id
      LEFT JOIN regions r ON cl.region_id=r.id LEFT JOIN schools s ON cl.school_id=s.id
      WHERE cl.id=?`, id),
    clOpenByCategory: (category_id, region_id, limit) => all(
      'SELECT id,title,summary,problem_count,support_count FROM clusters WHERE category_id=? AND (region_id=? OR region_id IS NULL) AND status != ? ORDER BY created_at DESC LIMIT ?',
      category_id, region_id || null, 'closed', limit || 8),
    clIncProblem: (id) => run('UPDATE clusters SET problem_count=problem_count+1 WHERE id=?', id),
    clSetSupport: (n, id) => run('UPDATE clusters SET support_count=? WHERE id=?', n, id),
    clSetStatus:  (status, id) => run("UPDATE clusters SET status=?, resolved_at=CASE WHEN ?='resolved' THEN strftime('%s','now') ELSE resolved_at END WHERE id=?", status, status, id),
    clFeed: (sort, offset, limit) => all(
      `SELECT cl.*,cat.name as category_name,cat.color as category_color,cat.icon as category_icon,
          r.name as region_name, s.name as school_name
       FROM clusters cl LEFT JOIN categories cat ON cl.category_id=cat.id
       LEFT JOIN regions r ON cl.region_id=r.id LEFT JOIN schools s ON cl.school_id=s.id
       WHERE cl.status != 'closed'
       ORDER BY ${sort === 'new' ? 'cl.created_at DESC' : sort === 'resolved' ? "cl.status='resolved' DESC, cl.resolved_at DESC" : 'cl.support_count DESC, cl.created_at DESC'}
       LIMIT ? OFFSET ?`, limit, offset),
    clByRegionCategory: (region_id, category_id, offset, limit) => all(
      `SELECT cl.*,cat.name as category_name,cat.color as category_color,cat.icon as category_icon
       FROM clusters cl LEFT JOIN categories cat ON cl.category_id=cat.id
       WHERE (? IS NULL OR cl.region_id=?) AND (? IS NULL OR cl.category_id=?)
       ORDER BY cl.support_count DESC LIMIT ? OFFSET ?`,
      region_id || null, region_id || null, category_id || null, category_id || null, limit, offset),
    clProblems: (cluster_id) => all('SELECT p.*,u.username,u.name as uname,u.color,u.avatar FROM problems p JOIN users u ON p.user_id=u.id WHERE p.cluster_id=? AND p.is_deleted=0 ORDER BY p.created_at ASC', cluster_id),

    /* ── supports ── */
    svCheck: (user_id, cluster_id) => get('SELECT 1 FROM supports WHERE user_id=? AND cluster_id=?', user_id, cluster_id),
    svInsert: (user_id, cluster_id) => run('INSERT INTO supports(user_id,cluster_id) VALUES(?,?) ON CONFLICT DO NOTHING', user_id, cluster_id),
    svDelete: (user_id, cluster_id) => run('DELETE FROM supports WHERE user_id=? AND cluster_id=?', user_id, cluster_id),
    svCount:  (cluster_id) => get('SELECT COUNT(*) as c FROM supports WHERE cluster_id=?', cluster_id),
    svByUser: (user_id) => all(`SELECT cl.*,cat.name as category_name,cat.color as category_color FROM supports sv
      JOIN clusters cl ON sv.cluster_id=cl.id LEFT JOIN categories cat ON cl.category_id=cat.id
      WHERE sv.user_id=? ORDER BY sv.created_at DESC`, user_id),

    /* ── solutions ── */
    solInsert: (id, cluster_id, user_id, source, title, body) =>
      run('INSERT INTO solutions(id,cluster_id,user_id,source,title,body) VALUES(?,?,?,?,?,?)', id, cluster_id, user_id || null, source, title, body),
    solByCluster: (cluster_id) => all('SELECT s.*,u.username,u.color,u.avatar FROM solutions s LEFT JOIN users u ON s.user_id=u.id WHERE s.cluster_id=? ORDER BY s.is_accepted DESC, s.votes DESC, s.created_at ASC', cluster_id),
    solOne: (id) => get('SELECT * FROM solutions WHERE id=?', id),
    solVoteCheck: (user_id, solution_id) => get('SELECT 1 FROM solution_votes WHERE user_id=? AND solution_id=?', user_id, solution_id),
    solVoteIns: (user_id, solution_id) => run('INSERT INTO solution_votes(user_id,solution_id) VALUES(?,?) ON CONFLICT DO NOTHING', user_id, solution_id),
    solVoteDel: (user_id, solution_id) => run('DELETE FROM solution_votes WHERE user_id=? AND solution_id=?', user_id, solution_id),
    solVoteCount: (solution_id) => get('SELECT COUNT(*) as c FROM solution_votes WHERE solution_id=?', solution_id),
    solSetVotes: (n, id) => run('UPDATE solutions SET votes=? WHERE id=?', n, id),
    solAccept: (id, cluster_id) => run('UPDATE solutions SET is_accepted=(id=?) WHERE cluster_id=?', id, cluster_id),

    /* ── comments ── */
    cmByCluster: (cluster_id) => all('SELECT c.*,u.username,u.name as uname,u.color,u.avatar FROM comments c JOIN users u ON c.user_id=u.id WHERE c.cluster_id=? ORDER BY c.created_at ASC', cluster_id),
    cmInsert: (id, cluster_id, user_id, body) => run('INSERT INTO comments(id,cluster_id,user_id,body) VALUES(?,?,?,?)', id, cluster_id, user_id, body),
    cmOwner: (id) => get('SELECT user_id, cluster_id FROM comments WHERE id=?', id),
    cmDelete: (id) => run("UPDATE comments SET is_deleted=1,body='[o''chirildi]' WHERE id=?", id),

    /* ── reports ── */
    rpInsert: (id, reporter_id, problem_id, comment_id, reason) => run('INSERT INTO reports(id,reporter_id,problem_id,comment_id,reason) VALUES(?,?,?,?,?)', id, reporter_id, problem_id || null, comment_id || null, reason),
    rpAll: () => all("SELECT r.*,u.username as rname FROM reports r JOIN users u ON r.reporter_id=u.id WHERE r.status='pending' ORDER BY r.created_at DESC LIMIT 50"),
    rpResolve: (status, id) => run('UPDATE reports SET status=? WHERE id=?', status, id),

    /* ── notifications ── */
    nInsert: (id, to_id, from_id, type, cluster_id, msg) => run('INSERT INTO notifications(id,to_id,from_id,type,cluster_id,msg) VALUES(?,?,?,?,?,?)', id, to_id, from_id || null, type, cluster_id || null, msg),
    nAll: (to_id) => all('SELECT n.*,u.username as fn,u.color as fc,u.avatar as fa FROM notifications n LEFT JOIN users u ON n.from_id=u.id WHERE n.to_id=? ORDER BY n.created_at DESC LIMIT 60', to_id),
    nMarkRead: (to_id) => run('UPDATE notifications SET is_read=1 WHERE to_id=?', to_id),
    nUnread: (to_id) => get('SELECT COUNT(*) as c FROM notifications WHERE to_id=? AND is_read=0', to_id),

    /* ── messages (DM) ── */
    msgConvos: (uid) => all('SELECT DISTINCT CASE WHEN from_id=? THEN to_id ELSE from_id END as oid FROM messages WHERE from_id=? OR to_id=?', uid, uid, uid),
    msgThread: (a, b) => all('SELECT * FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY created_at ASC LIMIT 150', a, b, b, a),
    msgInsert: (id, from_id, to_id, body, type, image_url, audio_url, duration) => run('INSERT INTO messages(id,from_id,to_id,body,type,image_url,audio_url,duration) VALUES(?,?,?,?,?,?,?,?)', id, from_id, to_id, body, type, image_url || null, audio_url || null, duration || null),
    msgMarkRead: (from_id, to_id) => run('UPDATE messages SET is_read=1 WHERE from_id=? AND to_id=?', from_id, to_id),
    msgLast: (a, b) => get('SELECT * FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY created_at DESC LIMIT 1', a, b, b, a),
    msgUnreadFrom: (from_id, to_id) => get('SELECT COUNT(*) as c FROM messages WHERE from_id=? AND to_id=? AND is_read=0', from_id, to_id),
    msgOwner: (id) => get('SELECT id,from_id,to_id FROM messages WHERE id=?', id),
    msgDelete: (id) => run('DELETE FROM messages WHERE id=?', id),

    /* ── push / reset / verify / telegram codes ── */
    pushIns: (user_id, token) => run('INSERT INTO push_tokens(user_id,token) VALUES(?,?) ON CONFLICT DO NOTHING', user_id, token),
    pushDel: (user_id, token) => run('DELETE FROM push_tokens WHERE user_id=? AND token=?', user_id, token),
    rtInsert: (token, user_id, expires_at) => run('INSERT INTO reset_tokens(token,user_id,expires_at) VALUES(?,?,?)', token, user_id, expires_at),
    rtGet: (token) => get("SELECT * FROM reset_tokens WHERE token=? AND used=0 AND expires_at > strftime('%s','now')", token),
    rtUse: (token) => run('UPDATE reset_tokens SET used=1 WHERE token=?', token),
    vcInsert: (id, user_id, code, expires_at) => run('INSERT INTO verify_codes(id,user_id,code,expires_at) VALUES(?,?,?,?)', id, user_id, code, expires_at),
    vcGet: (user_id, code) => get("SELECT * FROM verify_codes WHERE user_id=? AND code=? AND used=0 AND expires_at > strftime('%s','now')", user_id, code),
    vcUse: (id) => run('UPDATE verify_codes SET used=1 WHERE id=?', id),
    tgCodeInsert: (id, user_id, code, expires_at) => run('INSERT INTO tg_codes(id,user_id,code,expires_at) VALUES(?,?,?,?)', id, user_id, code, expires_at),
    tgCodeGet: (user_id, code) => get("SELECT * FROM tg_codes WHERE user_id=? AND code=? AND used=0 AND expires_at > strftime('%s','now')", user_id, code),
    tgCodeUse: (id) => run('UPDATE tg_codes SET used=1 WHERE id=?', id),

    /* ══════════════════════════════════════════════════════════════════
       Quyidagisi — eski (Reddit-uslubidagi) jamoalar/post/ovoz/izoh
       funksionalligi, 0002_legacy_restore.sql sxemasiga mos. "p*" prefiksi
       murojaatlar (problems) uchun band bo'lgani sabab bu yerda "pg"
       (post) va "pc" (post comment) prefikslari ishlatiladi.
       ══════════════════════════════════════════════════════════════════ */

    /* ── communities (jamoalar) ── */
    comAll:    () => all('SELECT c.*,u.username as oname FROM communities c JOIN users u ON c.owner_id=u.id ORDER BY c.members DESC LIMIT 60'),
    comById:   (id) => get('SELECT c.*,u.username as oname FROM communities c JOIN users u ON c.owner_id=u.id WHERE c.id=?', id),
    comBySlug: (slug) => get('SELECT c.*,u.username as oname FROM communities c JOIN users u ON c.owner_id=u.id WHERE lower(c.slug)=lower(?)', slug),
    comSearch: (p1, p2) => all('SELECT c.*,u.username as oname FROM communities c JOIN users u ON c.owner_id=u.id WHERE c.is_private=0 AND (lower(c.slug) LIKE ? OR lower(c.name) LIKE ?) LIMIT 20', p1, p2),
    comInsert: (id, slug, name, description, color, owner_id, is_private) => run('INSERT INTO communities(id,slug,name,description,color,owner_id,is_private) VALUES(?,?,?,?,?,?,?)', id, slug, name, description, color, owner_id, is_private || 0),
    comUpdate: (name, description, rules, color, id) => run('UPDATE communities SET name=?,description=?,rules=?,color=? WHERE id=?', name, description, rules, color, id),
    comUpdateFull: (name, description, rules, color, avatar, banner, id) => run('UPDATE communities SET name=?,description=?,rules=?,color=?,avatar=?,banner=? WHERE id=?', name, description, rules, color, avatar, banner, id),
    comSetPrivate: (is_private, id) => run('UPDATE communities SET is_private=? WHERE id=?', is_private, id),
    comDelete: (id) => run('DELETE FROM communities WHERE id=?', id),
    comIncMem: (id) => run('UPDATE communities SET members=members+1 WHERE id=?', id),
    comDecMem: (id) => run('UPDATE communities SET members=MAX(0,members-1) WHERE id=?', id),
    comIncViews: (id) => run('UPDATE communities SET views=views+1 WHERE id=?', id),
    comMine:   (user_id) => all('SELECT c.*,u.username as oname FROM communities c JOIN users u ON c.owner_id=u.id JOIN memberships m ON m.community_id=c.id WHERE m.user_id=? ORDER BY c.members DESC', user_id),
    comByViews: () => all('SELECT c.*,u.username as oname FROM communities c JOIN users u ON c.owner_id=u.id ORDER BY c.views DESC,c.members DESC LIMIT 20'),

    /* ── memberships / community roles / join requests ── */
    memCheck:  (user_id, community_id) => get('SELECT 1 FROM memberships WHERE user_id=? AND community_id=?', user_id, community_id),
    memJoin:   (user_id, community_id) => run('INSERT INTO memberships(user_id,community_id) VALUES(?,?) ON CONFLICT DO NOTHING', user_id, community_id),
    memLeave:  (user_id, community_id) => run('DELETE FROM memberships WHERE user_id=? AND community_id=?', user_id, community_id),
    comRoleGet:  (user_id, community_id) => get('SELECT role FROM community_roles WHERE user_id=? AND community_id=?', user_id, community_id),
    comRoleSet:  (user_id, community_id, role) => run('INSERT INTO community_roles(user_id,community_id,role) VALUES(?,?,?) ON CONFLICT (user_id,community_id) DO UPDATE SET role=excluded.role', user_id, community_id, role),
    comRoleDel:  (user_id, community_id) => run('DELETE FROM community_roles WHERE user_id=? AND community_id=?', user_id, community_id),
    comRoleList: (community_id) => all('SELECT cr.user_id,cr.role,u.username,u.name,u.avatar,u.color FROM community_roles cr JOIN users u ON cr.user_id=u.id WHERE cr.community_id=?', community_id),
    comReqInsert:  (id, user_id, community_id) => run('INSERT INTO community_requests(id,user_id,community_id) VALUES(?,?,?) ON CONFLICT DO NOTHING', id, user_id, community_id),
    comReqGet:     (user_id, community_id) => get("SELECT * FROM community_requests WHERE user_id=? AND community_id=? AND status='pending'", user_id, community_id),
    comReqGetById: (id) => get('SELECT * FROM community_requests WHERE id=?', id),
    comReqByCom:   (community_id) => all("SELECT cr.*,u.username,u.name,u.avatar,u.color FROM community_requests cr JOIN users u ON cr.user_id=u.id WHERE cr.community_id=? AND cr.status='pending' ORDER BY cr.created_at DESC", community_id),
    comReqApprove: (id) => run("UPDATE community_requests SET status='approved' WHERE id=?", id),
    comReqReject:  (id) => run("UPDATE community_requests SET status='rejected' WHERE id=?", id),
    comReqAll:     (user_id) => all('SELECT cr.*,c.name as cname,c.slug as cslug,c.color as ccolor FROM community_requests cr JOIN communities c ON cr.community_id=c.id WHERE cr.user_id=? ORDER BY cr.created_at DESC', user_id),

    /* ── posts ──
       Postgres'dagi POWER()-asosli "hot" formula D1/SQLite'da mavjud emas —
       so'nggi postlarni olib, "hot" tartiblashni JS tarafida (index.js
       computeHot()) hisoblaymiz. */
    pgRecent:  (limit) => all('SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id ORDER BY p.created_at DESC LIMIT ?', limit),
    pgTop:     (offset, limit) => all('SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id ORDER BY p.score DESC,p.created_at DESC LIMIT ? OFFSET ?', limit, offset),
    pgNew:     (offset, limit) => all('SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id ORDER BY p.created_at DESC LIMIT ? OFFSET ?', limit, offset),
    pgByCommunity: (community_id, sort, offset, limit) => all(
      `SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id
       WHERE p.community_id=? ORDER BY ${sort === 'new' ? 'p.created_at DESC' : 'p.score DESC,p.created_at DESC'} LIMIT ? OFFSET ?`, community_id, limit, offset),
    pgByCommunityRecent: (community_id, limit) => all('SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id WHERE p.community_id=? ORDER BY p.created_at DESC LIMIT ?', community_id, limit),
    pgByUser:  (user_id) => all('SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id WHERE p.user_id=? ORDER BY p.created_at DESC LIMIT 25', user_id),
    pgOne:     (id) => get('SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id WHERE p.id=?', id),
    pgInsert:  (id, user_id, community_id, title, body, link, image, video, audio, type, flair) => run('INSERT INTO posts(id,user_id,community_id,title,body,link,image,video,audio,type,flair) VALUES(?,?,?,?,?,?,?,?,?,?,?)', id, user_id, community_id, title, body, link, image, video, audio, type, flair),
    pgDelete:  (id) => run('DELETE FROM posts WHERE id=?', id),
    pgOwner:   (id) => get('SELECT user_id,community_id FROM posts WHERE id=?', id),
    pgScore:   (score, upvotes, downvotes, id) => run('UPDATE posts SET score=?,upvotes=?,downvotes=? WHERE id=?', score, upvotes, downvotes, id),
    pgIncCmt:  (id) => run('UPDATE posts SET comment_count=comment_count+1 WHERE id=?', id),
    pgDecCmt:  (n, id) => run('UPDATE posts SET comment_count=MAX(0,comment_count-?) WHERE id=?', n, id),
    pgSearch:  (p1, p2) => all('SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id WHERE lower(p.title) LIKE ? OR lower(p.body) LIKE ? ORDER BY p.score DESC LIMIT 20', p1, p2),
    pgSaved:   (user_id) => all('SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id JOIN saved_posts sp ON sp.post_id=p.id WHERE sp.user_id=? ORDER BY sp.saved_at DESC', user_id),
    pgSetAiTopic: (ai_topic, ai_status, id) => run('UPDATE posts SET ai_topic=?,ai_status=? WHERE id=?', ai_topic, ai_status, id),
    pgPendingAi: (limit) => all("SELECT * FROM posts WHERE ai_status='pending' ORDER BY created_at ASC LIMIT ?", limit || 5),
    pgSimilarByTopic: (ai_topic, excludeId, limit) => all('SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id WHERE p.ai_topic=? AND p.id!=? ORDER BY p.created_at DESC LIMIT ?', ai_topic, excludeId, limit || 5),

    /* ── post votes / saved posts ── */
    pvGet:    (user_id, post_id) => get('SELECT vote FROM post_votes WHERE user_id=? AND post_id=?', user_id, post_id),
    pvUpsert: (user_id, post_id, vote) => run('INSERT INTO post_votes(user_id,post_id,vote) VALUES(?,?,?) ON CONFLICT (user_id,post_id) DO UPDATE SET vote=excluded.vote', user_id, post_id, vote),
    pvDelete: (user_id, post_id) => run('DELETE FROM post_votes WHERE user_id=? AND post_id=?', user_id, post_id),
    pvCount:  (post_id) => get('SELECT COALESCE(SUM(CASE WHEN vote=1 THEN 1 ELSE 0 END),0) as up,COALESCE(SUM(CASE WHEN vote=-1 THEN 1 ELSE 0 END),0) as dn FROM post_votes WHERE post_id=?', post_id),
    svPCheck:  (user_id, post_id) => get('SELECT 1 FROM saved_posts WHERE user_id=? AND post_id=?', user_id, post_id),
    svPInsert: (user_id, post_id) => run('INSERT INTO saved_posts(user_id,post_id) VALUES(?,?) ON CONFLICT DO NOTHING', user_id, post_id),
    svPDelete: (user_id, post_id) => run('DELETE FROM saved_posts WHERE user_id=? AND post_id=?', user_id, post_id),

    /* ── post comments (parent_id/depth bilan threaded) ── */
    pcByPost: (post_id) => all('SELECT cm.*,u.username,u.color,u.avatar FROM post_comments cm JOIN users u ON cm.user_id=u.id WHERE cm.post_id=? ORDER BY cm.score DESC,cm.created_at ASC', post_id),
    pcInsert: (id, post_id, user_id, parent_id, body, depth) => run('INSERT INTO post_comments(id,post_id,user_id,parent_id,body,depth) VALUES(?,?,?,?,?,?)', id, post_id, user_id, parent_id, body, depth),
    pcOne:    (id) => get('SELECT cm.*,u.username,u.color,u.avatar FROM post_comments cm JOIN users u ON cm.user_id=u.id WHERE cm.id=?', id),
    pcOwner:  (id) => get('SELECT user_id,post_id FROM post_comments WHERE id=?', id),
    pcDelete: (id) => run("UPDATE post_comments SET is_deleted=1,body='[o''chirildi]' WHERE id=?", id),
    pcScore:  (score, id) => run('UPDATE post_comments SET score=? WHERE id=?', score, id),
    pcDepth:  (id) => get('SELECT depth FROM post_comments WHERE id=?', id),
    pcChildren: (parent_id) => all('SELECT id FROM post_comments WHERE parent_id=?', parent_id),
    pcDeleteMany:  (ids) => run(`DELETE FROM post_comments WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids),
    pcvDeleteMany: (ids) => run(`DELETE FROM post_comment_votes WHERE comment_id IN (${ids.map(() => '?').join(',')})`, ...ids),

    /* ── post comment votes ── */
    pcvGet:    (user_id, comment_id) => get('SELECT vote FROM post_comment_votes WHERE user_id=? AND comment_id=?', user_id, comment_id),
    pcvUpsert: (user_id, comment_id, vote) => run('INSERT INTO post_comment_votes(user_id,comment_id,vote) VALUES(?,?,?) ON CONFLICT (user_id,comment_id) DO UPDATE SET vote=excluded.vote', user_id, comment_id, vote),
    pcvDelete: (user_id, comment_id) => run('DELETE FROM post_comment_votes WHERE user_id=? AND comment_id=?', user_id, comment_id),
    pcvCount:  (comment_id) => get('SELECT COALESCE(SUM(CASE WHEN vote=1 THEN 1 ELSE 0 END),0) as up,COALESCE(SUM(CASE WHEN vote=-1 THEN 1 ELSE 0 END),0) as dn FROM post_comment_votes WHERE comment_id=?', comment_id),

    /* ── follows / karma ── */
    fwCheck:     (follower_id, following_id) => get('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?', follower_id, following_id),
    fwInsert:    (follower_id, following_id) => run('INSERT INTO follows(follower_id,following_id) VALUES(?,?) ON CONFLICT DO NOTHING', follower_id, following_id),
    fwDelete:    (follower_id, following_id) => run('DELETE FROM follows WHERE follower_id=? AND following_id=?', follower_id, following_id),
    fwFollowers: (following_id) => get('SELECT COUNT(*) as c FROM follows WHERE following_id=?', following_id),
    fwFollowing: (follower_id) => get('SELECT COUNT(*) as c FROM follows WHERE follower_id=?', follower_id),
    fwFollowersList: (following_id) => all('SELECT follower_id FROM follows WHERE following_id=?', following_id),
    uKarma:          (delta, id) => run('UPDATE users SET karma=karma+? WHERE id=?', delta, id),
    uFollowersSync:  (id) => run('UPDATE users SET followers=(SELECT COUNT(*) FROM follows WHERE following_id=users.id) WHERE id=?', id),

    /* ── polls ── */
    pollInsert:     (id, post_id, question, options, duration_days, ends_at) => run('INSERT INTO polls(id,post_id,question,options,duration_days,ends_at) VALUES(?,?,?,?,?,?)', id, post_id, question, options, duration_days, ends_at),
    pollGet:        (post_id) => get('SELECT * FROM polls WHERE post_id=?', post_id),
    pollGetById:    (id) => get('SELECT * FROM polls WHERE id=?', id),
    pollVoteGet:    (user_id, poll_id) => get('SELECT option_index FROM poll_votes WHERE user_id=? AND poll_id=?', user_id, poll_id),
    pollVoteIns:    (user_id, poll_id, option_index) => run('INSERT INTO poll_votes(user_id,poll_id,option_index) VALUES(?,?,?) ON CONFLICT DO NOTHING', user_id, poll_id, option_index),
    pollVoteCnt:    (poll_id) => all('SELECT option_index,COUNT(*) as cnt FROM poll_votes WHERE poll_id=? GROUP BY option_index', poll_id),
    pollTotalVotes: (poll_id) => get('SELECT COUNT(*) as c FROM poll_votes WHERE poll_id=?', poll_id),

    /* ── eski turlar uchun qo'shimcha notification/report yozuvlari ──
       (nInsert/rpInsert cluster_id/problem_id bilan ishlaydi — bular esa
       post_id/post_comment_id bilan, xuddi shu jadvallarga) */
    nInsertPost: (id, to_id, from_id, type, post_id, post_comment_id, msg) => run('INSERT INTO notifications(id,to_id,from_id,type,post_id,post_comment_id,msg) VALUES(?,?,?,?,?,?,?)', id, to_id, from_id || null, type, post_id || null, post_comment_id || null, msg),
    rpInsertPost: (id, reporter_id, post_id, post_comment_id, reason) => run('INSERT INTO reports(id,reporter_id,post_id,post_comment_id,reason) VALUES(?,?,?,?,?)', id, reporter_id, post_id || null, post_comment_id || null, reason),

    /* ── Telegram bot muloqot holati (webhook, D1-asosli) ── */
    tgStateSet: (chat_id, user_id, code, expires_at) => run('INSERT INTO tg_bot_state(chat_id,user_id,code,expires_at) VALUES(?,?,?,?) ON CONFLICT (chat_id) DO UPDATE SET user_id=excluded.user_id,code=excluded.code,expires_at=excluded.expires_at', chat_id, user_id, code, expires_at),
    tgStateGet: (chat_id) => get('SELECT * FROM tg_bot_state WHERE chat_id=?', chat_id),
    tgStateDel: (chat_id) => run('DELETE FROM tg_bot_state WHERE chat_id=?', chat_id),

    /* ── admin/dashboard — taqdimotdagi boshqaruv paneli statistikasi ── */
    dashStats: async () => {
      const [total, places, solutions, resolvedPct, users, posts, communities] = await Promise.all([
        get('SELECT COUNT(*) as c FROM problems WHERE is_deleted=0'),
        get(`SELECT (SELECT COUNT(*) FROM regions) + (SELECT COUNT(*) FROM schools) as c`),
        get('SELECT COUNT(*) as c FROM solutions'),
        get(`SELECT CASE WHEN COUNT(*)=0 THEN 0 ELSE ROUND(100.0*SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END)/COUNT(*)) END as pct FROM clusters`),
        get('SELECT COUNT(*) as c FROM users'),
        get('SELECT COUNT(*) as c FROM posts'),
        get('SELECT COUNT(*) as c FROM communities'),
      ]);
      return { total_problems: total.c, places: places.c, solutions: solutions.c, resolved_pct: resolvedPct.pct || 0, total_users: users.c, total_posts: posts.c, total_communities: communities.c };
    },
    dashTopCategoriesByRegion: (region_id) => all(
      `SELECT cat.id, cat.name, cat.color, cat.icon, COUNT(*) as cnt
       FROM clusters cl JOIN categories cat ON cl.category_id=cat.id
       WHERE (? IS NULL OR cl.region_id=?)
       GROUP BY cat.id ORDER BY cnt DESC`, region_id || null, region_id || null),
    dashRegionBreakdown: () => all(
      `SELECT r.id, r.name, COUNT(cl.id) as cluster_count,
          SUM(CASE WHEN cl.status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved_count
       FROM regions r LEFT JOIN clusters cl ON cl.region_id=r.id
       GROUP BY r.id ORDER BY cluster_count DESC`),
  };
}
