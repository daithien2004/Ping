-- Local drill: so số hàng và dấu vân tay dữ liệu (không in nội dung/secret).
-- Chỉ dùng cho DB luyện tập nhỏ; string_agg không thích hợp cho DB production lớn.
SELECT 'User', count(*), md5(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) FROM "User" t
UNION ALL SELECT 'Session', count(*), md5(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) FROM "Session" t
UNION ALL SELECT 'Server', count(*), md5(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) FROM "Server" t
UNION ALL SELECT 'Role', count(*), md5(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) FROM "Role" t
UNION ALL SELECT 'Member', count(*), md5(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) FROM "Member" t
UNION ALL SELECT 'MemberRole', count(*), md5(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) FROM "MemberRole" t
UNION ALL SELECT 'Channel', count(*), md5(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) FROM "Channel" t
UNION ALL SELECT 'Message', count(*), md5(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) FROM "Message" t
UNION ALL SELECT 'AuditLog', count(*), md5(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) FROM "AuditLog" t
UNION ALL SELECT '_prisma_migrations', count(*), md5(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) FROM _prisma_migrations t
ORDER BY 1;
