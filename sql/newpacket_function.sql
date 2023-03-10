-- function and trigger so that inserts to the 'packets' table are transmitted via a NOTIFY process
--
--
--                          Table "public.packets"
--   Column   |           Type           | Collation | Nullable | Default 
--------------+--------------------------+-----------+----------+---------
-- tm         | timestamp with time zone |           | not null | 
-- callsign   | text                     |           | not null | 
-- symbol     | text                     |           |          | 
-- speed_mph  | numeric                  |           |          | 
-- bearing    | numeric                  |           |          | 
-- altitude   | numeric                  |           |          | 
-- comment    | text                     |           |          | 
-- location2d | geometry(Point,4326)     |           |          | 
-- location3d | geometry(PointZ,4326)    |           |          | 
-- raw        | text                     |           |          | 
-- ptype      | text                     |           |          | 
-- hash       | text                     |           | not null | 
-- source     | text                     |           | not null | 
-- channel    | numeric                  |           | not null | 
-- frequency  | numeric                  |           |          | 
--Indexes:
--    "packets_pkey" PRIMARY KEY, btree (tm, source, channel, callsign, hash)
--    "packets_idx2" btree (callsign)
--    "packets_idx3" btree (ptype)
--    "packets_idx5" btree (hash)
--    "packets_tm" btree (tm)
--    "packets_tm_source_ptype" btree (tm, source, ptype)


CREATE or REPLACE FUNCTION notify_new_packet()
    RETURNS trigger
     LANGUAGE 'plpgsql'
as $BODY$
declare
begin
    if (tg_op = 'INSERT') then
 
        perform pg_notify('new_packet', row_to_json(NEW)::text);
    end if;
 
    return null;
end
$BODY$;


CREATE or REPLACE TRIGGER after_new_packet
    AFTER INSERT
    ON packets
    FOR EACH ROW
    EXECUTE PROCEDURE notify_new_packet();


