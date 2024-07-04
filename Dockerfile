# -------------------
# The build container
# -------------------
FROM ubuntu:22.04 AS build

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/Denver

RUN apt-get update \
&& apt-get upgrade -y \
&& apt-get install -y --no-install-recommends \
 git-core ca-certificates \
&& apt-get install -y locales \
&& rm -rf /var/lib/apt/lists/* \
# make the "en_US.UTF-8" locale so postgres will be utf-8 enabled by default
&& localedef -i en_US -c -f UTF-8 -A /usr/share/locale/locale.alias en_US.UTF-8

ENV LANG=en_US.utf8

# Get packages -- Note: comes from install-packages.bash
RUN apt-get update \
&& apt-get install -qq -y --no-install-recommends \
 git sed sudo wget vim tini usbutils \
 gcc g++ make cmake build-essential \
# Apache web server
 apache2 apache2-dev php php-pgsql php-sqlite3 php-cli php-cgi libapache2-mod-php \
# PostgreSQL
 postgresql-14 postgis postgresql-14-postgis-3 postgresql-14-postgis-3-scripts  \
# Python libraries
 python3-mapnik python3-matplotlib python3-numpy python3-pip python3-psutil python3-psycopg2 python3-scipy python3-usb \
# Build libraries
 alsa-utils libusb-1.0-0-dev libasound2-dev libudev-dev ax25-tools \
 libevent-dev libssl-dev libsctp-dev libcap-dev zlib1g-dev \
# Gnuradio and libraries
 gnuradio gnuradio-dev gr-osmosdr rtl-sdr airspy \
# GPSD and libraries
 gpsd gpsd-clients libgps-dev \
# Additional packages
 libttspico-utils ffmpeg net-tools htop wavemon avahi-daemon avahi-utils \
&& apt-get -y remove --purge pulseaudio modemmanager \
&& apt-get clean autoclean \
&& apt-get autoremove --yes \
&& rm -rf /var/lib/{apt,dpkg,cache,log}/ 

#### Install eosstracker from https://github.com/TheKoola/eosstracker ####

WORKDIR /

# Configure user eosstracker, create directory and set permissions
RUN adduser --disabled-password --disabled-login --gecos "EOSS tracker user" eosstracker; \
 adduser eosstracker audio && adduser eosstracker dialout; \
 usermod -aG sudo eosstracker; \
 usermod -aG plugdev eosstracker; \
 usermod -aG sudo www-data; \
 echo "export PGDATABASE=aprs" >> /home/eosstracker/.bashrc; \
 echo "set -o vi" >> /home/eosstracker/.bashrc; \
 echo "alias p='ps -ef | egrep \"direwolf|aprsc|gpsd|killsession|kill_session|habtracker-daemon|gpswss\" | grep -v grep'" \
     >> /home/eosstracker/.bash_aliases; \
 echo "alias r='cat /eosstracker/sql/shortlist.sql | psql -d aprs'" >> /home/eosstracker/.bash_aliases; \
 echo "alias blank='echo \"update teams set flightid=NULL;\" | psql -d aprs'" >> /home/eosstracker/.bash_aliases; \
# Set up gnuradio preferences
 su - eosstracker -c "mkdir -p /home/eosstracker/.gnuradio/prefs/"; \
 su - eosstracker -c 'echo -n "gr::vmcircbuf_sysv_shm_factory" >> /home/eosstracker/.gnuradio/prefs/vmcircbuf_default_factory'; \
# Set up /eosstracker
 mkdir /eosstracker; \
 chown -R eosstracker:eosstracker /eosstracker; \
# Install aprslib
 su - eosstracker -c "pip3 install --no-cache-dir aprslib"; \
# Install eosstracker
 su - eosstracker -c "cd /; git clone --progress -b brickv2.1 https://github.com/TheKoola/eosstracker.git"; \
 su - eosstracker -c "cd /eosstracker; git status"; \
 mkdir /eosstracker/db; \
 chown -R eosstracker:eosstracker /eosstracker/db; \
# Fix permissions -- Note: comes from fixperms.bash
 chmod 777 /eosstracker/www/configuration /eosstracker/www/audio; \
 chmod 444 /eosstracker/www/configuration/defaults.txt; \
# Fix airspy
 echo "ATTR{idVendor}==\"1d50\", ATTR{idProduct}==\"60a1\", SYMLINK+=\"airspy-%k\", MODE=\"660\", GROUP=\"plugdev\"" \
  >> /etc/udev/rules.d/52-airspy.rules; \
# Update sudoers 
 echo "#### These are for the eosstracker and www-data web user" >> /etc/sudoers; \
 #echo "eosstracker ALL=(ALL) NOPASSWD: /opt/aprsc/sbin/aprsc, /sr/bin/pkill" >> /etc/sudoers; \ 
 echo "eosstracker ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers; \
 echo "www-data ALL=(eosstracker) NOPASSWD: /eosstracker/bin/start_session.bash, /eosstracker/bin/killsession_wrapper.bash" >> /etc/sudoers

# Set time zone
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone 

#### Install direwolf from https://www.github.com/wb2osz/direwolf.git with EOSS mods ####

WORKDIR /usr/src/app

RUN git clone --progress -b 1.6 https://github.com/wb2osz/direwolf.git && \
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
 git clone --progress https://github.com/edgeofspace/aprsc.git && \
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
ENV GPS_DEVICE=/dev/ttyUSB0
ENV EOSS_NODEID=EOSS-Docker
ENV EOSS_IS_DOCKER=1

# Get packages
RUN apt-get update \
&& apt-get upgrade -y \
&& apt-get install -y --no-install-recommends \
locales ca-certificates \
# Run environment for direwolf
 libasound2-dev libudev-dev libgps-dev ax25-tools \
# Run environment for aprsc
 libevent-dev libssl-dev libsctp-dev libcap-dev zlib1g-dev \
# Run environment for eosstracker
 git sudo curl wget \
# Apache web server
 apache2 apache2-dev php php-pgsql php-sqlite3 php-cli php-cgi libapache2-mod-php \
# PostgreSQL
 postgresql-14 postgis postgresql-14-postgis-3 postgresql-14-postgis-3-scripts  \
# Python libraries
 python3-mapnik python3-matplotlib python3-numpy python3-pip python3-psutil python3-psycopg2 python3-scipy python3-usb \
# Gnuradio and libraries
 gnuradio gnuradio-dev gr-osmosdr rtl-sdr airspy \
# Run environment for gpsd
 gpsd gpsd-clients libgps-dev \
# General utilities
 alsa-utils usbutils libusb-1.0-0-dev libasound2-dev libudev-dev libevent-dev \
 libttspico-utils ffmpeg net-tools wavemon vim avahi-daemon avahi-utils \
&& apt-get -y remove --purge pulseaudio modemmanager \
&& apt-get clean autoclean \
&& apt-get autoremove --yes \
&& rm -rf /var/lib/apt/lists/* \
# make the "en_US.UTF-8" locale so it will be utf-8 by default
&& localedef -i en_US -c -f UTF-8 -A /usr/share/locale/locale.alias en_US.UTF-8 \
&& rm -rf /var/lib/{apt,dpkg,cache,log}/

ENV LANG=en_US.utf8

# Set time zone
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Configure user eosstracker, create directory and set permissions
RUN adduser --disabled-password --disabled-login --gecos "EOSS tracker user" eosstracker; \
 adduser eosstracker audio && adduser eosstracker dialout; \
 usermod -aG sudo eosstracker; \
 usermod -aG plugdev eosstracker; \
 usermod -aG sudo www-data; \
# Make /usr/src/eosstracker and set permissions
 mkdir /usr/src/eosstracker; \
 chown -R eosstracker:eosstracker /usr/src/eosstracker; \
# Install aprslib
 su - eosstracker -c "pip3 install --no-cache-dir aprslib"; \
# Update sudoers
 echo "#### These are for the eosstracker and www-data web user" >> /etc/sudoers; \
#  echo "eosstracker ALL=(ALL) NOPASSWD: /opt/aprsc/sbin/aprsc, /usr/bin/pkill" >> /etc/sudoers; \ 
 echo "eosstracker ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers; \
 echo "www-data ALL=(eosstracker) NOPASSWD: /eosstracker/bin/start_session.bash, /eosstracker/bin/killsession_wrapper.bash" >> /etc/sudoers

# Configure gpsd ports
# EXPOSE 2947/tcp

# Configure apache ports
EXPOSE 80/tcp 443/tcp

# Configure postgresql ports
# EXPOSE 5432/tcp 5432/udp

# Configure aprsc ports and user
EXPOSE 14501/tcp
RUN adduser --system --no-create-home --home /var/run/aprsc --shell /usr/sbin/nologin --group aprsc

# Configure direwolf ports
# EXPOSE 8000/tcp 8001/tcp

# Copy the binaries from the build image
COPY --from=build /etc/udev/rules.d/99-direwolf-cmedia.rules /etc/udev/rules.d/
COPY --from=build /usr/local/ /usr/local/
COPY --from=build /opt/ /opt/
COPY --from=build /root/ /root/
COPY --from=build /home/eosstracker/ /home/eosstracker/
COPY --from=build /eosstracker/ /usr/src/eosstracker/

# Fix permissions and set nodeid.txt
RUN cd /usr/src/eosstracker; \
 chmod 777 /usr/src/eosstracker/www/configuration /usr/src/eosstracker/www/audio; \
 chmod 444 /usr/src/eosstracker/www/configuration/defaults.txt; \
 su eosstracker -c 'echo "EOSS-Docker" >> /usr/src/eosstracker/www/nodeid.txt'; \
 chmod 444 /usr/src/eosstracker/www/nodeid.txt

# Unlock aprsc for testing
RUN sed -i '$d' /opt/aprsc/etc/aprsc.conf; sed -i '$d' /opt/aprsc/etc/aprsc.conf

# Fix airspy
RUN echo "ATTR{idVendor}==\"1d50\", ATTR{idProduct}==\"60a1\", SYMLINK+=\"airspy-%k\", MODE=\"660\", GROUP=\"plugdev\"" \
 >> /etc/udev/rules.d/52-airspy.rules

# Configure PostgreSQL 
RUN service postgresql start && \
 su - postgres -c "createuser eosstracker"; \
 MyPass="'Thisisthedatabasepassword!'"; \
 MyCommand="echo \"alter user eosstracker with encrypted password $MyPass;\" | psql"; \
 su - postgres -c "$MyCommand" && \
 su - postgres -c "createdb aprs -O eosstracker" && \
 su - postgres -c 'echo "create extension postgis;" | psql -d aprs' && \
 su eosstracker -c "psql -q -d aprs -f /usr/src/eosstracker/sql/aprs-database.v2.sql" && \
 su eosstracker -c "psql -q -d aprs -f /usr/src/eosstracker/sql/eoss_specifics.sql" && \
 service postgresql stop && \
 cp -rpa /var/lib/postgresql /usr/src/eosstracker/db/; \
 rm -fr /var/lib/postgresql; \
 sed -i "s/data_directory = '\/var\/lib\/postgresql\/14\/main'/data_directory = '\/eosstracker\/db\/postgresql\/14\/main'/g" \
       /etc/postgresql/14/main/postgresql.conf 

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
 service apache2 stop

# Configure gpsd
RUN sed -i 's/GPSD_OPTIONS=""/GPSD_OPTIONS="-n -G"/g' /etc/default/gpsd; \
 MyGPSDevice="${GPS_DEVICE}"; \
 sed -i 's/DEVICES=""/DEVICES="$MyGPSDevice"/g' /etc/default/gpsd; \
 sed -i 's/ListenStream=127.0.0.1:2947/#ListenStream=127.0.0.1:2947/g' /lib/systemd/system/gpsd.socket; \
 sed -i 's/# ListenStream=0.0.0.0:2947/ListenStream=0.0.0.0:2947/g' /lib/systemd/system/gpsd.socket

COPY run.sh /

WORKDIR /
VOLUME /eosstracker

CMD ["/bin/bash"]

