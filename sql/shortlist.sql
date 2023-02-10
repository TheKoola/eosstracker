--##################################################
--#    This file is part of the HABTracker project for tracking high altitude balloons.
--#
--#    Copyright (C) 2019,2023 Jeff Deaton (N6BA)
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

-- Query to list those APRS packets that have been added to the database over the last 5 mins.

\pset pager

select 
date_trunc('second', f.tm)::timestamp without time zone as thetime,
f.callsign,
case when array_length(f.path, 1) > 0 then
    f.path[array_length(f.path, 1)]
else
    f.sourcename
end as heardfrom,
f.comment,
f.speed_mph,
f.bearing,
f.alt_ft,
f.coords,
f.freq_mhz,
f.source

from
    (select distinct
    a.tm,
    a.callsign, 
    case when a.raw similar to '[0-9A-Za-z]*[\-]*[0-9]*>%' then
        split_part(a.raw, '>', 1)
    else
        NULL
    end as sourcename,
    a.comment, 
    a.ptype,
    a.bearing,
    a.source,
    round(a.speed_mph) as speed_mph,
    round(a.altitude) as altitude, 
    round(cast(ST_Y(a.location2d) as numeric), 3) || ', ' || round(cast(ST_X(a.location2d) as numeric), 3) as coords,
    round(a.altitude,0) as "alt_ft",
    a.symbol,
    round(a.frequency / 1000000.0,3) as freq_mhz, 
    case when a.raw similar to '%>%:%' then
        (string_to_array(regexp_replace(split_part(split_part(a.raw, ':', 1), '>', 2), ',WIDE[0-9]*[\-]*[0-9]*', '', 'g'), ','))[2:]
    else
        NULL
    end as path

    from 
    packets a

    where 
    a.tm > (now() - interval '00:05:00')

    order by 
    a.tm,
    a.callsign) as f

order by
thetime asc,
f.callsign,
f.source
;
