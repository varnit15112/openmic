# Mic Night NYC

A mobile-friendly map and list of NYC open mics. Pick a day, filter by borough, type, start time or distance, and see every mic color-coded by start time.

**Live site:** https://varnit15112.github.io/openmic/

## Run locally

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server
```

## Data

Listings live in `data/mics.js` (currently dummy data). Each entry has a name, venue, address, borough, coordinates, weekdays (`0` = Sunday), a 24h start time (`24:30` = 12:30am), type, fee and sign-up info.

## Stack

Plain HTML/CSS/JS with [Leaflet](https://leafletjs.com/) and Esri street map tiles. No build step.
