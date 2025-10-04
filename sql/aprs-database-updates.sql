--##################################################
--#    This file is part of the HABTracker project for tracking high altitude balloons.
--#
--#    Copyright (C) 2025, Jeff Deaton (N0JD)
--#
--#    HABTracker is free software: you can redistribute it and/or modify
--#    it under the terms of the GNU General Public License as published by
--#    the Free Software Foundation, either version 3 of the License, or
--#    (at your option) any later version.
--#
--#    HABTracker is distributed in the hope that it will be useful,
--#    but WITHOUT ANY WARRANTY; without even the implied warranty of
--#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
--#    GNU General Public License for more details.
--#
--#    You should have received a copy of the GNU General Public License
--#    along with HABTracker.  If not, see <https://www.gnu.org/licenses/>.
--#
--##################################################

CREATE or REPLACE FUNCTION notify_on_change()
    RETURNS trigger
     LANGUAGE 'plpgsql'
as $BODY$
declare
begin
    if (tg_nargs > 0) then
        if (tg_argv[0] != '') then
            perform pg_notify(tg_argv[0], to_jsonb(NEW)::text);
        end if;
    end if;

    return null;
end
$BODY$;

DROP TRIGGER IF EXISTS after_flights_change_v1 ON flights;
CREATE TRIGGER after_flights_change_v1
    AFTER INSERT or UPDATE or DELETE
    ON flights
    FOR EACH ROW
    EXECUTE PROCEDURE notify_on_change('flights');

DROP TRIGGER IF EXISTS after_flightmap_change_v1 ON flightmap;
CREATE TRIGGER after_flightmap_change_v1
    AFTER INSERT or UPDATE or DELETE
    ON flightmap
    FOR EACH ROW
    EXECUTE PROCEDURE notify_on_change('flights');

DROP TRIGGER IF EXISTS after_trackers_change_v1 ON trackers;
CREATE TRIGGER after_trackers_change_v1
    AFTER INSERT or UPDATE or DELETE
    ON trackers
    FOR EACH ROW
    EXECUTE PROCEDURE notify_on_change('trackers');
