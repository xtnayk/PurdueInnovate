# Demo field geography

The Fleet map's example farm now places its 40 demo jobs on 40 actual agricultural land polygons mapped in OpenStreetMap, in rural northwestern Tippecanoe County near West Lafayette, Indiana. It no longer projects a generated grid over the city.

These are community-mapped `landuse=farmland` outlines, not surveyed property boundaries, ownership records, pesticide application boundaries or the user's own farm. Field names, acreage, crops, operator assignments, schedules, sprayer motion and the choice of a depot remain simulation inputs. A mapped field's physical area may differ from its demo job acreage. Straight connectors between fields are not road directions.

## Source and license

- Provider: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
- License: [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
- Retrieved: October 30, 2026, through the public [OSM map API](https://www.openstreetmap.org/api/0.6/map?bbox=-87.13,40.46,-86.96,40.58).
- Query bounds, west/south/east/north: `-87.13, 40.46, -86.96, 40.58`.
- Selected field bounds, south/west to north/east: `[40.490172, -87.0251083]` to `[40.5409796, -86.9534035]`.
- Example-map center: `40.515712, -86.9757655`.
- Demo depot location: `40.5124548, -86.9757892`, inside mapped farmyard [way 1541456975](https://www.openstreetmap.org/way/1541456975). Its use as the fleet's depot is fictional; no affiliation with a landowner is implied.

The derived data is available as [GeoJSON](../web/demo-farmland.geojson) and the runtime [JavaScript dataset](../web/demo-geography.js). Each field retains its OSM way ID, version and source timestamp. The selected original node coordinates and 41 way records (40 fields plus the farmyard) are retained in [the source extract](field-geography-source.osm). The map must retain visible `© OpenStreetMap contributors` attribution even when the background uses a different provider or is offline.

## Selection and verification

The source response contained 182 ways tagged `landuse=farmland`. Selection used a compact rural area around `40.516, -86.976`, excluding ways participating in multipolygon relations, open rings, self-crossing rings, and very small or very large land areas. Forty geometries were selected with no proper edge crossings or interior overlap detected. This avoids rendering an outer ring without its potentially significant holes.

The dataset preserves the original vertex coordinates. Marker/label centers are computed inside each ring, rather than using a bounding-box center that may fall outside a concave field. IDs are assigned in five north-to-south bands, ordered west-to-east within each band, to loosely retain the existing example's route ordering. The real shapes are not stretched, shifted or sized to match synthetic job acres.

The geographic dataset applies only to the built-in example farm. A farmer-entered profile without mapped boundaries must remain explicitly schematic; its location text must not silently place those fields on these unrelated properties. Real customer use needs boundary import or map drawing and owner review.
