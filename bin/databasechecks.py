##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019, 2020, 2021 Jeff Deaton (N6BA)
#
#    HABTracker is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    HABTracker is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with HABTracker.  If not, see <https://www.gnu.org/licenses/>.
#
##################################################

import datetime 
import psycopg2 as pg
import threading as th
import sys
from inspect import getframeinfo, stack

#import local configuration items
import habconfig 

##################################################
# Single function for processing the collection of database/table updates
##################################################
def databaseUpdates(logger):
    """
    This function contains a collection of checks and upates to database tables.  As the version of this code advances, 
    place updates to tables here.
    """

    try:
        # Database connection 
        dbconn = None
        dbconn = pg.connect (habconfig.dbConnectionString)
        dbconn.set_session(autocommit=True)
        dbcur = dbconn.cursor()


        ts = datetime.datetime.now()
        time_string = ts.strftime("%Y-%m-%d %H:%M:%S")
        logger.info(f"/******* Starting database checks:  {time_string} ********/")
        sys.stdout.flush()



        #------------------- tracker stuff ------------------#
        # SQL to check if the column exists or not
        check_row_sql = "select * from teams where tactical='ZZ-Not Active';"
        dbcur.execute(check_row_sql)
        rows = dbcur.fetchall()

        # If the number of rows returned is zero, then we need to add the row
        if len(rows) == 0:
            logger.info("Adding the 'ZZ-Not Active' team to the tracker team list.")
            sys.stdout.flush()
            
            # SQL to add the row
            insert_sql = "insert into teams (tactical, flightid) values ('ZZ-Not Active', NULL);"
            dbcur.execute(insert_sql)
            dbconn.commit()
        #------------------- tracker stuff ------------------#


        #------------------- landingpredictions table ------------------#
        # This is the list of columns we need to check as older versions of the software/database might not have been updated.
        check_columns = [ ("flightpath", "geometry(LINESTRING, 4326)"), ("ttl", "numeric"), ("patharray", "numeric[][]"), ("winds", "numeric[]") ]

        for column, coltype in check_columns:
            # SQL to check if the column exists or not
            check_column_sql = "select column_name from information_schema.columns where table_name='landingpredictions' and column_name=%s;"
            dbcur.execute(check_column_sql, [ column ])
            rows = dbcur.fetchall()

            # If the number of rows returned is zero, then we need to create the column
            if len(rows) == 0:
                logger.info(f"Adding landingpredictions::{column} column.")
                sys.stdout.flush()
                
                # SQL to alter the "landingpredictions" table and add the "flightpath" column
                alter_table_sql = "alter table landingpredictions add column " + column + " " + coltype + ";";
                dbcur.execute(alter_table_sql)
                dbconn.commit()

        # SQL to add an index on the time column of the landingpredictions table
        lp_tm_exists = "select exists (select * from pg_indexes where schemaname='public' and tablename = 'landingpredictions' and indexname = 'landingpredictions_tm');"
        dbcur.execute(lp_tm_exists)
        rows = dbcur.fetchall()
        if len(rows) > 0:
            if rows[0][0] == False:
                # Add the index since it didn't seem to exist.
                sql_add = "create index landingpredictions_tm on landingpredictions(tm);"
                logger.info("Adding landingpredictions_tm index.")
                sys.stdout.flush()
                logger.debug("Adding landingpredictions_tm index to the landingpredictions table: %s" % sql_add)
                dbcur.execute(sql_add)
                dbconn.commit()

        #------------------- landingpredictions table ------------------#



        #------------------- packets table ------------------#
        # SQL to add an index on the time column of the packets table
        sql_exists = "select exists (select * from pg_indexes where schemaname='public' and tablename = 'packets' and indexname = 'packets_tm');"
        dbcur.execute(sql_exists)
        rows = dbcur.fetchall()
        if len(rows) > 0:
            if rows[0][0] == False:
                # Add the index since it didn't seem to exist.
                sql_add = "create index packets_tm on packets(tm);"
                logger.info("Adding packets_tm index.")
                sys.stdout.flush()
                logger.debug("Adding packets_tm index to the packets table: %s" % sql_add)
                dbcur.execute(sql_add)
                dbconn.commit()


        # This is the list of columns we need to check as older versions of the software/database might not have been updated.
        check_columns = [ ("source", "text"), ("channel", "numeric"), ("frequency", "numeric") ]

        made_changes = False
        for column, coltype in check_columns:
            # SQL to check if the column exists or not
            check_column_sql = "select column_name from information_schema.columns where table_name='packets' and column_name=%s;"
            dbcur.execute(check_column_sql, [ column ])
            rows = dbcur.fetchall()

            # If the number of rows returned is zero, then we need to create the column
            if len(rows) == 0:
                logger.info(f"Adding packets::{column} column.")
                sys.stdout.flush()

                # SQL to alter the "landingpredictions" table and add the "flightpath" column
                alter_table_sql = "alter table packets add column " + column + " " + coltype + ";";
                dbcur.execute(alter_table_sql)
                dbconn.commit()
                made_changes = True


        if made_changes:

            # SQL to check how many rows are in the packets and landingpredictions tables
            packets_sql = "select count(*) from packets;"
            lp_sql = "select count(*) from landingpredictions;"

            logger.info("Checking number of rows in tables...")
            sys.stdout.flush()

            dbcur.execute(packets_sql)
            rows = dbcur.fetchall()
            packets_count = rows[0][0]

            dbcur.execute(lp_sql)
            rows = dbcur.fetchall()
            lp_count = rows[0][0]

            logger.info(f"Number of rows:  packets={packets_count}, landingpredictions={lp_count}")
            sys.stdout.flush()


            # SQL to update the source column to "other" in those cases were it's empty
            sql_source = "update packets set source='other' where source is null;"
            logger.info("Updating packets::source column.")
            sys.stdout.flush()
            logger.debug("Updating source column: %s" % sql_source);
            dbcur.execute(sql_source)
            dbconn.commit()

            # SQL to update the channel column to "-1" in those cases were it's empty
            sql_channel = "update packets set channel=-1 where channel is null;"
            logger.info("Updating packets::channel column.")
            sys.stdout.flush()
            logger.debug("Updating channel column: %s" % sql_channel);
            dbcur.execute(sql_channel)
            dbconn.commit()

            # SQL to drop the primary index if it exists
            sql_exists = "select exists (select * from pg_indexes where schemaname='public' and tablename = 'packets' and indexname = 'packets_pkey');"
            dbcur.execute(sql_exists)
            rows = dbcur.fetchall()
            if len(rows) > 0:
                if rows[0][0] == True:
                    sql_drop = "alter table packets drop constraint packets_pkey;"
                    logger.debug("Dropping existing primary key: %s" % sql_drop);
                    logger.info("Dropping primary key from packets table.")
                    dbcur.execute(sql_drop)
                    dbconn.commit()

            # Now add back an updated primary index
            sql_add = "alter table packets add primary key (tm, source, channel, callsign, hash);"
            logger.info("Adding primary key to packets table.")
            sys.stdout.flush()
            logger.debug("Adding new primary key: %s" % sql_add);
            try:
                dbcur.execute(sql_add)
                dbconn.commit()
            except pg.DatabaseError as e:
                # We were unable to add this key back to the existing table.  The only path forward from here is to delete all rows...
                logger.error(f"Error updating primary key: {e}")

                # SQL to truncate rows older than one month.
                sql_source = "truncate table packets;"
                logger.error("Unable to create index on packets table, deleteing all rows...sorry, only way.  :(")
                sys.stdout.flush()
                logger.debug("Deleting all rows from packets table: %s" % sql_source);
                dbcur.execute(sql_source)
                dbconn.commit()

                logger.info("Adding primary key on packets table.")
                dbcur.execute(sql_add)
                dbconn.commit()


        # SQL to add an index on the tm, source, and ptype columns of the packets table
        sql_exists = "select exists (select * from pg_indexes where schemaname='public' and tablename = 'packets' and indexname = 'packets_tm_source_ptype');"
        dbcur.execute(sql_exists)
        rows = dbcur.fetchall()
        if len(rows) > 0:
            if rows[0][0] == False:
                # Add the index since it didn't seem to exist.
                sql_add = "create index packets_tm_source_ptype on packets(tm, source, ptype);"
                logger.info("Adding packets_tm_source_ptype index.")
                sys.stdout.flush()
                logger.debug("Adding packets_tm_source_ptype index to the packets table: %s" % sql_add)
                dbcur.execute(sql_add)
                dbconn.commit()

        #------------------- packets table ------------------#



        #------------------- triggers and notifications ------------------#

        # SQL to add a trigger on inserts into the packets table.  This trigger is then used to call PG_NOTIFY to notify listening clients that a new
        # packet was added to the table.
        sql_function = """CREATE or REPLACE FUNCTION notify_v1()
                            RETURNS trigger
                             LANGUAGE 'plpgsql'
                        as $BODY$
                        declare
                        begin
                            if (tg_nargs > 0) then
                                if (tg_argv[0] != '') then
                                    if (tg_op = 'INSERT') then
                                        perform pg_notify(tg_argv[0], (ST_asGeoJSON(NEW)::jsonb)::text);
                                    end if;
                                end if;
                            end if;
                                 
                            return null;
                        end
                        $BODY$;"""
        sql_trigger_newpacket = """CREATE TRIGGER after_new_packet_v1
                        AFTER INSERT
                        ON packets
                        FOR EACH ROW
                        EXECUTE PROCEDURE notify_v1('new_packet');"""
        sql_trigger_newposition = """CREATE TRIGGER after_new_position_v1
                        AFTER INSERT
                        ON gpsposition
                        FOR EACH ROW
                        EXECUTE PROCEDURE notify_v1('new_position');"""
        sql_checkfunction = "select p.proname from pg_proc p where p.proname = 'notify_v1';"
        sql_checktrigger_packet = "select t.tgname from pg_trigger t where t.tgname = 'after_new_packet_v1';"
        sql_checktrigger_position = "select t.tgname from pg_trigger t where t.tgname = 'after_new_position_v1';"
        
        # check if the function exists already
        dbcur.execute(sql_checkfunction)
        rows = dbcur.fetchall()
        if len(rows) <= 0:
            # Add the function since it doesn't exist
            logger.info("Adding notify_v1 function to database.")
            sys.stdout.flush()
            logger.debug("Adding notify_v1 function to database.")
            dbcur.execute(sql_function)
            dbconn.commit()

        # check if the packet trigger exists already
        dbcur.execute(sql_checktrigger_packet)
        rows = dbcur.fetchall()
        if len(rows) <= 0:
            # Add the trigger since it doesn't exist
            logger.info("Adding after_new_packet_v1 trigger to the packets table.")
            sys.stdout.flush()
            logger.debug("Adding after_new_packet_v1 trigger to the packets table.")
            dbcur.execute(sql_trigger_newpacket)
            dbconn.commit()

        # check if the gpsposition trigger exists already
        dbcur.execute(sql_checktrigger_position)
        rows = dbcur.fetchall()
        if len(rows) <= 0:
            # Add the trigger since it doesn't exist
            logger.info("Adding after_new_position_v1 trigger to the packets table.")
            sys.stdout.flush()
            logger.debug("Adding after_new_position_v1 trigger to the packets table.")
            dbcur.execute(sql_trigger_newposition)
            dbconn.commit()

        #------------------- triggers and notifications ------------------#

        ts = datetime.datetime.now()
        time_string = ts.strftime("%Y-%m-%d %H:%M:%S")
        logger.info(f"/******* Completed database checks: {time_string} ********/")
        sys.stdout.flush()

        # Close DB connection
        dbcur.close()
        dbconn.close()


    except pg.DatabaseError as error:
        dbcur.close()
        dbconn.close()
        logger.error(f"Database error occurred: {error}")
