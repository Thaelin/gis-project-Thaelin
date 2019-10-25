#!/bin/bash
DB_USER=$1
DB_PWD=$2
DB_SERVER=$3
DB_NAME=$4

echo "Deleting previous tables"
PGPASSWORD=$2 psql -d $4 -h $3 -U $1 -f import1.sql

echo "Importing route data"
for file in cyklotrasy/*.gpx; do
	ogr2ogr -f "PostgreSQL" PG:"dbname=pdt_geo user=postgres password=postgres" $file -update -append -unsetDefault -forceNullable
done

PGPASSWORD=$2 psql -d $4 -h $3 -U $1 -f import2.sql
PGPASSWORD=$2 psql -d $4 -h $3 -U $1 -f import1.sql