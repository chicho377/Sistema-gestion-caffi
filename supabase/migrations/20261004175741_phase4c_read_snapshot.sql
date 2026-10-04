begin;
-- A single MVCC snapshot keeps server_now and the returned sessions consistent:
-- a concurrent Play committed after this read began cannot appear with a later start.
alter function private.work_read(uuid) stable;
commit;
