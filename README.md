# Mic Night NYC

A mobile-friendly map and list of NYC open mics. Pick a day, filter by borough, type, start time or distance, and see every mic color-coded by start time.

**Live site:** https://varnit15112.github.io/openmic/

## Run locally

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server
```

## Data

Listings live in `data/mics.js`: 90 NYC comedy open mics transcribed from the [@eyecandycomedy](https://www.instagram.com/eyecandycomedy/) Fall '26 mic list. Venue addresses were checked by web search and geocoded with the US Census geocoder. Each entry has a mic name, venue, address, neighborhood, borough, coordinates, weekdays (`0` = Sunday), a 24h start time, whether it runs weekly, and an optional note (e.g. "Sober mic"). Entries with `lat`/`lng` of `null` show in the list but not on the map.

## Stack

Plain HTML/CSS/JS with [Leaflet](https://leafletjs.com/) and Esri street map tiles. No build step.
