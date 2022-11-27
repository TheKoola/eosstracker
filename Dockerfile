# -------------------
# The build container
# -------------------
FROM ubuntu:22.04 AS build

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/Denver

RUN apt-get update \
&& apt-get install -y --no-install-recommends \
 git-core \
 ca-certificates \
&& apt-get update 

# make the "en_US.UTF-8" locale so postgres will be utf-8 enabled by default
RUN apt-get update && apt-get install -y locales && rm -rf /var/lib/apt/lists/* \
        && localedef -i en_US -c -f UTF-8 -A /usr/share/locale/locale.alias en_US.UTF-8
ENV LANG en_US.utf8

# Get packages -- Note: comes from install-packages.bash
RUN apt-get update \
&& apt-get install -qq -y --no-install-recommends \
 git sed sudo wget vim tini usbutils \
 gcc g++ make cmake \
 apache2 apache2-dev php php-pgsql \
 postgresql-14 postgresql-14-postgis-3 postgresql-14-postgis-3-scripts postgis \
 python3-mapnik python3-matplotlib python3-numpy python3-pip python3-psutil python3-psycopg2 python3-scipy python3-usb \
 libasound2-dev libudev-dev libgps-dev ax25-tools \
 libevent-dev libssl-dev libsctp-dev libcap-dev zlib1g-dev \
 gnuradio gnuradio-dev gr-osmosdr rtl-sdr airspy \
 gpsd gpsd-clients \
 ipheth-utils libttspico-utils ffmpeg net-tools htop wavemon \
 alsa-utils \
&& apt-get clean autoclean \
&& apt-get autoremove --yes \
&& rm -rf /var/lib/{apt,dpkg,cache,log}/ 

#### Install eosstracker from https://github.com/TheKoola/eosstracker ####

WORKDIR /usr/src/app

# Configure user eosstracker, create directory and set permissions
RUN adduser --disabled-password --disabled-login --gecos "EOSS tracker user" eosstracker; \
 adduser eosstracker audio && adduser eosstracker dialout; \
 usermod -aG sudo eosstracker; \
 usermod -aG sudo www-data; \
 echo "export PGDATABASE=aprs" >> /home/eosstracker/.bashrc; \
 echo "set -o vi" >> /home/eosstracker/.bashrc; \
 echo "alias p='ps -ef | egrep \"direwolf|aprsc|gpsd|killsession|kill_session|habtracker-daemon|gpswss\" | grep -v grep'" \
     >> /home/eosstracker/.bash_aliases; \
 echo "alias r='cat /eosstracker/sql/shortlist.sql | psql -d aprs'" >> /home/eosstracker/.bash_aliases; \
 echo "alias blank='echo \"update teams set flightid=NULL;\" | psql -d aprs'" >> /home/eosstracker/.bash_aliases; \
# Set up /eosstracker
 mkdir /eosstracker; \
 chown -R eosstracker:eosstracker /eosstracker; \
# Install aprslib
 su - eosstracker -c "pip3 install --no-cache-dir aprslib"; \
# Install eosstracker
 cd /usr/src/app; \
 git clone https://github.com/TheKoola/eosstracker.git; \
 cd /usr/src/app/eosstracker; \
 git checkout brickv2; \
 git pull; \
 su eosstracker -c "cp -rpa bin doc etc logs sbin sql www /eosstracker/"; \
 su eosstracker -c "cp -rpa .git /eosstracker/"; \
 su eosstracker -c "cp -pa .gitignore /eosstracker/"; \
 su eosstracker -c "cp -pa CHANGES.md CUSTOMIZATION.md LICENSE README.md /eosstracker/"; \
 su eosstracker -c "cp -pa cleanandstage.bash fixperms.bash setupnewhome.bash /eosstracker/"; \
 mkdir /eosstracker/osm /eosstracker/maps /eosstracker/db; \
 chown -R eosstracker:eosstracker /eosstracker/osm /eosstracker/maps /eosstracker/db; \
# Cleanup any old files -- Note: comes from cleanandstage.bash
 cd /eosstracker/www/images/aprs; \
 rm -f index.html makeall.bash makeimages-overlays.bash makeimages.bash; \
 rm -f makeimages2.bash makeimages3.bash symbols-new.txt symbols.csv symbols.txt; \
 rm -f symbols2.csv tocalls.bash tocalls.txt tocalls2.bash tocalls3.bash; \
 cd /eosstracker/www; \
 rm -f common/COPYING common/sessionvariables.php common/symbols.js images/graphics/eosslogo.png; \
 rm -f predictiondata/*.txt preferences.php; \ 
 rm -fr images/flightindicators/img images/aprs/aprs-symbol-index/; \
 cd /eosstracker; \
 rm -f bin/COPYING www/COPYING; \
# Set up github -- Note: comes from cleanandstage.bash
 su eosstracker -c "git checkout -- etc/README logs/.gitignore logs/README sql/eoss_specifics.sql"; \
 su eosstracker -c "git pull && git status"; \
# Fix permissions -- Note: comes from fixperms.bash
 chmod 777 /eosstracker/www/configuration /eosstracker/www/audio; \
 chmod 444 /eosstracker/www/configuration/defaults.txt; \
# Update sudoers 
 echo "#### These are for the eosstracker and www-data web user" >> /etc/sudoers; \
 #echo "eosstracker ALL=(ALL) NOPASSWD: /opt/aprsc/sbin/aprsc, /sr/bin/pkill" >> /etc/sudoers; \ 
 echo "eosstracker ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers; \
 echo "www-data ALL=(eosstracker) NOPASSWD: /eosstracker/bin/start_session.bash, /eosstracker/bin/killsession_wrapper.bash" >> /etc/sudoers

# Set time zone
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone 

#### Install direwolf from https://www.github.com/wb2osz/direwolf.git with EOSS mods ####

WORKDIR /usr/src/app

RUN git clone -b 1.6 https://github.com/wb2osz/direwolf.git && \
 cd /usr/src/app/direwolf/src; \
 sed -i 's/#define MAX_ADEVS [0-9]/#define MAX_ADEVS 9/g' direwolf.h; \
 sed -i 's/if (new_count > delete_count + [0-9][0-9][0-9]) {/if (new_count > delete_count + 500) {/g' rrbb.c; \
 sed -i 's/#define MAX_FILTER_SIZE [0-9][0-9][0-9]/#define MAX_FILTER_SIZE 500/g' fsk_demod_state.h; \
 cd /usr/src/app/direwolf; \
 mkdir build; \
 cd /usr/src/app/direwolf/build; \
 cmake .. && \
 make -j4 && \
 make install && \
 make install-conf

#### Install EOSS aprsc from https://github.com/edgeofspace/aprsc.git ####

WORKDIR /usr/src/app

RUN adduser --system --no-create-home --home /var/run/aprsc --shell /usr/sbin/nologin --group aprsc; \
 git clone https://github.com/edgeofspace/aprsc.git && \
 cd /usr/src/app/aprsc/src; \
 ./configure --prefix /opt/aprsc && \
 make && \
 make install && \
 mkdir -p -m 755 /opt/aprsc/usr /opt/aprsc/dev; \
 ln -s /usr/lib /opt/aprsc/lib; \
 ln -s /usr/lib /opt/aprsc/usr/lib; \
 ln -s /usr/lib64 /opt/aprsc/lib64; \
 ln -s /usr/lib64 /opt/aprsc/usr/lib64; \
 chmod 755 /opt/aprsc/etc /opt/aprsc/dev;  \
 cp -p /etc/resolv.conf /etc/nsswitch.conf /etc/hosts /etc/gai.conf /opt/aprsc/etc/; \
 cp -pa /dev/urandom /dev/random /dev/null /dev/zero /opt/aprsc/dev/; \
 chmod 775 /opt/aprsc/etc; \
 chown -R aprsc:eosstracker /opt/aprsc/etc; \
 chown -R aprsc:aprsc /opt/aprsc/logs /opt/aprsc/web /opt/aprsc/sbin /opt/aprsc/data

# -------------------------
# The application container
# -------------------------
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/Denver

# Get packages
RUN apt-get update \
&& apt-get upgrade -y \
&& apt-get install -y --no-install-recommends \
 ca-certificates \
# Run environment for direwolf
 libasound2-dev libudev-dev gpsd libgps-dev ax25-tools \
# Run environment for aprsc
 libevent-dev libssl-dev libsctp-dev libcap-dev zlib1g-dev \
# Run environment for eosstracker
 git sudo curl wget \
 apache2 php php-pgsql \
 postgresql-14 postgresql-14-postgis-3 postgresql-14-postgis-3-scripts postgis \
 python3-mapnik python3-matplotlib python3-numpy python3-pip python3-psutil python3-psycopg2 python3-scipy python3-usb \
 gnuradio gnuradio-dev gr-osmosdr rtl-sdr airspy \
 gpsd gpsd-clients alsa-utils \
# General utilities
 ipheth-utils libttspico-utils ffmpeg net-tools htop wavemon \
&& apt-get clean autoclean \
&& apt-get autoremove --yes \
&& rm -rf /var/lib/{apt,dpkg,cache,log}/

# make the "en_US.UTF-8" locale so it will be utf-8 by default
RUN apt-get update && apt-get install -y locales && rm -rf /var/lib/apt/lists/* \
        && localedef -i en_US -c -f UTF-8 -A /usr/share/locale/locale.alias en_US.UTF-8
ENV LANG en_US.utf8

# Set time zone
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Configure user eosstracker, create directory and set permissions
RUN adduser --disabled-password --disabled-login --gecos "EOSS tracker user" eosstracker; \
 adduser eosstracker audio && adduser eosstracker dialout; \
 usermod -aG sudo eosstracker; \
 usermod -aG sudo www-data; \
 mkdir /eosstracker; \
 chown -R eosstracker:eosstracker /eosstracker; \
# Install aprslib
 su - eosstracker -c "pip3 install --no-cache-dir aprslib"; \
# Update sudoers
 echo "#### These are for the eosstracker and www-data web user" >> /etc/sudoers; \
 #echo "eosstracker ALL=(ALL) NOPASSWD: /opt/aprsc/sbin/aprsc, /sr/bin/pkill" >> /etc/sudoers; \ 
 echo "eosstracker ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers; \
 echo "www-data ALL=(eosstracker) NOPASSWD: /eosstracker/bin/start_session.bash, /eosstracker/bin/killsession_wrapper.bash" >> /etc/sudoers

# Configure gpsd
EXPOSE 2947/tcp

# Configure apache
EXPOSE 80/tcp 443/tcp

# Configure postgresql
EXPOSE 5432/tcp 5432/udp

# Configure aprsc
EXPOSE 8080/udp 14501/tcp 14580/tcp 14580/udp 10152/tcp 10152/udp
RUN adduser --system --no-create-home --home /var/run/aprsc --shell /usr/sbin/nologin --group aprsc

# Configure direwolf
EXPOSE 8000/tcp 8001/tcp

# Copy the binaries from the build image
COPY --from=build /etc/udev/rules.d/99-direwolf-cmedia.rules /etc/udev/rules.d/
COPY --from=build /usr/local/ /usr/local/
COPY --from=build /opt/ /opt/
COPY --from=build /root/ /root/
COPY --from=build /home/eosstracker/ /home/eosstracker/
COPY --from=build /eosstracker/ /eosstracker/
COPY --from=build /eosstracker/ /root/target/eosstracker/

# Check github status and set nodeid.txt
RUN cd /eosstracker; \
 su eosstracker -c "git pull && git status"; \
 echo "EOSS-Docker" >> /eosstracker/www/nodeid.txt; \
 echo "EOSS-Docker" >> /root/target/eosstracker/www/nodeid.txt; \
 chown eosstracker:eosstracker /eosstracker/www/nodeid.txt; \
 chown eosstracker:eosstracker /root/target/eosstracker/www/nodeid.txt; \
 chmod 444 /root/target/eosstracker/www/nodeid.txt; \
 chmod 444 /eosstracker/www/nodeid.txt

# Unlock aprsc for testing
RUN sed -i '$d' /opt/aprsc/etc/aprsc.conf; sed -i '$d' /opt/aprsc/etc/aprsc.conf

# Configure PostgreSQL 
RUN cp -rpa /var/lib/postgresql/* /eosstracker/db/; \
 sed -i "s/data_directory = '\/var\/lib\/postgresql\/14\/main'/data_directory = '\/eosstracker\/db\/14\/main'/g" \
       /etc/postgresql/14/main/postgresql.conf; \
 service postgresql start && \
 su - postgres -c "createuser eosstracker"; \
 MyPass="'Thisisthedatabasepassword!'"; \
 MyCommand="echo \"alter user eosstracker with encrypted password $MyPass;\" | psql"; \
 su - postgres -c "$MyCommand" && \
 su - postgres -c "createdb aprs -O eosstracker" && \
 su - postgres -c 'echo "create extension postgis;" | psql -d aprs' && \
 cd /eosstracker/sql; \
 su eosstracker -c "psql -d aprs -f ./aprs-database.v2.sql" && \
 su eosstracker -c "psql -d aprs -f ./eoss_specifics.sql"

# Configure Apache
RUN a2enmod ssl; \
 a2enmod rewrite; \
 echo "" >> /etc/apache2/apache2.conf; \
 echo "# Added for EOSS" >> /etc/apache2/apache2.conf; \
 echo "ServerName eosstracker.local" >> /etc/apache2/apache2.conf; \
 #sed -i 's/#ServerName www.example.com/ServerName eosstracker.local/g' /etc/apache2/sites-enabled/000-default.conf; \
 service apache2 start; \
 a2ensite default-ssl; \
 sed -i 's/ServerAdmin webmaster@localhost/&\n        ### this is so unencrypted web connections are redirected to the SSL URL\n \
       RewriteEngine On\n \
       RewriteCond %{HTTPS} off\n \
       RewriteRule (.*) https:\/\/%{SERVER_NAME}\/$1 [R,L]/' /etc/apache2/sites-enabled/000-default.conf; \
 sed -i 's/DocumentRoot \/var\/www\/html/DocumentRoot \/eosstracker\/www/g' /etc/apache2/sites-enabled/000-default.conf; \
 sed -i 's/DocumentRoot \/var\/www\/html/DocumentRoot \/eosstracker\/www/g' /etc/apache2/sites-enabled/default-ssl.conf; \
 echo "<Directory /eosstracker/www/>" >> /etc/apache2/apache2.conf; \
 echo "	Options Indexes FollowSymLinks" >> /etc/apache2/apache2.conf; \
 echo "	AllowOverride None" >> /etc/apache2/apache2.conf; \
 echo "	Require all granted" >> /etc/apache2/apache2.conf; \
 echo "</Directory>" >> /etc/apache2/apache2.conf; \
 service apache2 restart

# Configure gpsd
RUN sed -i 's/GPSD_OPTIONS=""/GPSD_OPTIONS="-n -G"/g' /etc/default/gpsd; \
 sed -i 's/ListenStream=127.0.0.1:2947/#ListenStream=127.0.0.1:2947/g' /lib/systemd/system/gpsd.socket; \
 sed -i 's/# ListenStream=0.0.0.0:2947/ListenStream=0.0.0.0:2947/g' /lib/systemd/system/gpsd.socket

COPY run.sh /
RUN cp -rpa /eosstracker/db /root/target/eosstracker/

WORKDIR /
VOLUME /eosstracker

CMD ["/bin/bash"]

