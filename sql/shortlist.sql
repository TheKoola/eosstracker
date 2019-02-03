--##################################################
--#    This file is part of the HABTracker project for tracking high altitude balloons.
--#
--#    Copyright (C) 2019, Jeff Deaton (N6BA)
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

-- Short query to list those APRS packets that have been added to the database over the last 5 mins.

select  distinct 
date_trunc('second', a.tm)::time without time zone as thetime,
--a.instance || ',' || a.channel as channel,
a.callsign,
--a.heardfrom,
--a.manufacturer,
a.comment,
round(cast(ST_Y(a.location2d) as numeric), 3) || ', ' || round(cast(ST_X(a.location2d) as numeric), 3) as coords,
round(a.altitude,0) as "alt"
--a.hash
--a.raw
--round(cast(ST_DistanceSphere(ST_GeomFromText('POINT(-104.797435 39.348673)',4326), a.location2d)*.621371/1000 as numeric), 0) as "distance (mi)"


from
packets a

where 
a.tm > (now() - time '00:05:00')

order by 
1 asc,
2
;
