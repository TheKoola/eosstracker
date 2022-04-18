drop table if exists aprsstatus cascade;
drop table if exists priorities cascade;
drop table if exists statusqueue cascade;
drop table if exists statusacknowledgements cascade;
drop view if exists dynamicstatus;

create table priorities (
    id numeric primary key,
    name text,
    description text
);

-- Standard severity/priority levels
insert into priorities values (0, 'Informational', 'Not generally important or time sensitive');
insert into priorities values (1, 'Priority', 'Somewhat important to review, but not terribly time sensitive');
insert into priorities values (2, 'Warning', 'Important and time sensitive');
insert into priorities values (3, 'Event Notice', 'A very important event has occurred');


create table aprsstatus (
    id numeric primary key,
    transmit_text text,
    priority numeric,
    foreign key (priority) references priorities(id) on update cascade on delete cascade
);

-- These are canned states that can be selected for transmit 
insert into aprsstatus values (0, 'Waiting', 0);
insert into aprsstatus values (1, 'Out of The Vehicle', 1);
insert into aprsstatus values (2, 'Proceeding Down Range', 0);
insert into aprsstatus values (3, 'Actively Tracking', 0);
insert into aprsstatus values (4, 'Have Visual on Flight', 1);
insert into aprsstatus values (5, 'Witnessed Flight Landing', 3);
insert into aprsstatus values (6, 'Flight Launch', 3);
insert into aprsstatus values (7, 'Leading Client Caravan', 1);
insert into aprsstatus values (8, 'Need EOSS Help', 2);
insert into aprsstatus values (9, 'Listening to 446.050 Simplex', 1);
insert into aprsstatus values (10, 'Listening to 446.100 Simplex', 1);
insert into aprsstatus values (11, 'Listening to 446.150 Simplex', 1);
insert into aprsstatus values (12, 'Listening to 446.200 Simplex', 1);

create view dynamicstatus as
    select
    a.transmit_text || ': ' || b.flightid as transmit_text,
    a.priority as priority

    from
    (select transmit_text, priority from aprsstatus where id in (3, 4, 5, 6, 7)) as a,
    (select flightid from flights where flightid not like 'RSONDE%' and active='y') as b

    union
    select a.transmit_text, a.priority from aprsstatus a where a.id not in (3, 4, 5, 6, 7)

    order by
    2 asc,
    1 asc
;

create table statusqueue (
    tm timestamp with time zone,
    transmit_text text,
    transmitted boolean,
    primary key (tm, transmit_text)
);

create table statusacknowledgements (
    thetime timestamp without time zone,
    callsign text,
    statusmsg text,
    primary key (thetime, callsign, statusmsg)
);

