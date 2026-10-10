/*
 * ShougShapes.jsx  —  Shoug 2.0 shape library (27 shapes)
 * Drawn once in code by Claude for Dordor Games. Do NOT redesign these;
 * use them as-is and only change fill/text/colors through props.
 *
 * Groups:
 *   doors    – 9 tall arch/frame shapes (decorative panels, scene frames)
 *   boxes    – 9 answer boxes  (toast, pill, ticket, scallop, pricetag, bubble, folder, stamp, label)
 *   stickers – 9 sticker boxes (daisy, starburst, cloud, polaroid, ribbon, blob, matchacup, journal, peel)
 *
 * Usage:
 *   import { ShougShape, NARRATION_SHAPE, CONTINUE_SHAPE, pickChoiceShape } from "./ShougShapes";
 *   <ShougShape shape="toast">Shoug spots a ridiculous phone strap.</ShougShape>
 *   <ShougShape shape={pickChoiceShape(nodeId, i)} as="button" onClick={...}>Buy the strap</ShougShape>
 *
 * Style rules baked in: 3px jet-black outline (non-scaling), hard 7px offset shadow (no blur).
 */
import React from "react";

export const SHOUG_COLORS = {
  cream: "#FBF4E4", matcha: "#8DB36B", matchaDeep: "#4F6E3A", matchaDarkest: "#2F4524",
  mint: "#D7EACD", sakura: "#F6CFD8", maroon: "#6E1F35", butter: "#FFE278",
  yolk: "#F2B705", black: "#0C0C0C", white: "#FFFFFF",
};

export const SHOUG_SHAPES = {
 "door-parisian": {
  "label": "The Parisian",
  "group": "doors",
  "viewBox": "0 0 352.0 532.0",
  "w": 352.0,
  "h": 532.0,
  "d": "M6 526 L6 176 L8 149 L14 124 L24 99 L38 76 L56 56 L76 38 L99 24 L124 14 L149 8 L176 6 L203 8 L228 14 L253 24 L276 38 L296 56 L314 76 L328 99 L338 124 L344 149 L346 176 L346 526 Z",
  "fill": "#8DB36B",
  "ink": "#0C0C0C",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   14.8,
   11.4,
   14.8,
   11.4
  ]
 },
 "door-toast": {
  "label": "The Toast Slice Door",
  "group": "doors",
  "viewBox": "0 0 399.6 525.2",
  "w": 399.6,
  "h": 525.2,
  "d": "M30 519 L30 139 L16 127 L6 122 L7 108 L10 99 L18 82 L27 69 L35 61 L52 46 L80 31 L105 21 L133 13 L170 7 L200 6 L230 7 L267 13 L294 21 L320 31 L347 46 L365 61 L372 69 L382 82 L390 99 L392 108 L394 122 L384 127 L370 139 L370 519 Z",
  "fill": "#F6CFD8",
  "ink": "#0C0C0C",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   13.7,
   16.0,
   15.0,
   16.0
  ]
 },
 "door-chapel": {
  "label": "The Chapel",
  "group": "doors",
  "viewBox": "0 0 352.0 533.2",
  "w": 352.0,
  "h": 533.2,
  "d": "M6 527 L6 212 L9 186 L15 161 L26 136 L39 113 L56 90 L71 74 L93 54 L118 36 L146 20 L176 6 L206 20 L234 36 L259 54 L281 74 L296 90 L313 113 L326 136 L337 161 L343 186 L346 212 L346 527 Z",
  "fill": "#6E1F35",
  "ink": "#FBF4E4",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   15.0,
   11.4,
   14.8,
   11.4
  ]
 },
 "door-shopfront": {
  "label": "The Shopfront",
  "group": "doors",
  "viewBox": "0 0 392.8 532",
  "w": 392.8,
  "h": 532,
  "d": "M26 526 L26 74 L6 74 L6 33 L67 6 L326 6 L387 33 L387 74 L366 74 L366 526 Z",
  "fill": "#FBF4E4",
  "ink": "#0C0C0C",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   14.8,
   15.4,
   14.8,
   15.4
  ]
 },
 "door-keyhole": {
  "label": "The Keyhole",
  "group": "doors",
  "viewBox": "0 0 392.8 532.0",
  "w": 392.8,
  "h": 532.0,
  "d": "M54 526 L54 322 L40 305 L29 287 L17 260 L11 239 L7 218 L6 196 L8 167 L13 145 L23 118 L37 92 L50 75 L60 64 L81 45 L106 29 L125 20 L139 15 L167 8 L196 6 L225 8 L254 15 L267 20 L287 29 L312 45 L333 64 L348 81 L356 92 L370 118 L380 145 L384 167 L387 196 L386 218 L382 239 L376 260 L364 287 L353 305 L339 322 L339 526 Z",
  "fill": "#4F6E3A",
  "ink": "#FBF4E4",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   14.8,
   15.4,
   14.8,
   15.4
  ]
 },
 "door-cakebox": {
  "label": "The Cake Box Door",
  "group": "doors",
  "viewBox": "0 0 352.0 529.3",
  "w": 352.0,
  "h": 529.3,
  "d": "M6 523 L6 58 L6 50 L10 34 L12 27 L20 16 L30 8 L40 6 L50 8 L60 16 L68 27 L72 42 L74 58 L74 50 L78 34 L84 21 L93 12 L98 8 L103 7 L113 7 L123 12 L128 16 L136 27 L140 42 L142 58 L142 50 L146 34 L152 21 L161 12 L166 8 L176 6 L186 8 L191 12 L200 21 L206 34 L210 50 L210 58 L212 42 L216 27 L224 16 L229 12 L239 7 L249 7 L254 8 L259 12 L268 21 L274 34 L278 50 L278 58 L280 42 L284 27 L292 16 L302 8 L312 6 L322 8 L332 16 L340 27 L342 34 L346 50 L346 58 L346 523 Z",
  "fill": "#F6CFD8",
  "ink": "#0C0C0C",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   14.4,
   11.4,
   14.9,
   11.4
  ]
 },
 "door-flacon": {
  "label": "The Flacon",
  "group": "doors",
  "viewBox": "0 0 352.0 532",
  "w": 352.0,
  "h": 532,
  "d": "M47 526 L36 525 L22 518 L14 510 L12 506 L9 501 L6 490 L7 186 L9 175 L12 165 L20 150 L31 136 L49 121 L71 108 L89 101 L108 97 L135 94 L135 60 L118 60 L118 6 L234 6 L234 60 L217 60 L217 94 L237 96 L257 99 L269 103 L287 111 L303 121 L317 132 L329 145 L337 160 L343 175 L345 186 L346 196 L346 490 L343 501 L338 510 L334 514 L330 518 L321 523 L310 526 Z",
  "fill": "#8DB36B",
  "ink": "#0C0C0C",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   14.8,
   11.4,
   14.8,
   11.4
  ]
 },
 "door-ticket": {
  "label": "The Ticket Door",
  "group": "doors",
  "viewBox": "0 0 352 532",
  "w": 352,
  "h": 532,
  "d": "M30 6 L322 6 L346 30 L346 261 L334 264 L326 269 L321 274 L318 280 L315 292 L318 304 L323 312 L328 317 L334 320 L346 323 L346 502 L322 526 L30 526 L6 502 L6 323 L18 320 L26 315 L31 310 L34 304 L37 292 L34 280 L29 272 L24 267 L18 264 L6 261 L6 30 Z",
  "fill": "#FBF4E4",
  "ink": "#0C0C0C",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   14.8,
   11.4,
   14.8,
   11.4
  ]
 },
 "door-vanity": {
  "label": "The Vanity",
  "group": "doors",
  "viewBox": "0 0 352.0 532.0",
  "w": 352.0,
  "h": 532.0,
  "d": "M6 202 L9 167 L17 133 L23 117 L30 101 L43 80 L53 66 L64 54 L76 43 L89 34 L102 25 L116 18 L131 13 L146 9 L161 7 L176 6 L191 7 L206 9 L228 16 L243 22 L257 29 L276 43 L299 66 L318 94 L332 125 L338 141 L342 158 L344 175 L346 193 L346 424 L345 437 L341 449 L334 462 L325 473 L314 484 L300 494 L284 503 L258 513 L239 519 L208 524 L176 526 L144 524 L113 519 L85 510 L60 498 L38 484 L22 467 L11 449 L6 430 Z",
  "fill": "#6E1F35",
  "ink": "#FBF4E4",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   14.8,
   11.4,
   14.8,
   11.4
  ]
 },
 "toast": {
  "label": "The Toast Slice",
  "group": "boxes",
  "viewBox": "0 0 461.4 217.8",
  "w": 461.4,
  "h": 217.8,
  "d": "M21 212 L21 88 L6 82 L6 76 L9 68 L17 58 L32 46 L49 37 L75 27 L99 20 L125 15 L161 10 L192 7 L231 6 L270 7 L300 10 L336 15 L363 20 L387 27 L412 37 L429 46 L444 58 L452 68 L455 76 L455 82 L441 88 L441 212 Z",
  "fill": "#F6CFD8",
  "ink": "#0C0C0C",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   33.6,
   13.6,
   12.4,
   13.6
  ]
 },
 "pill": {
  "label": "The Pill",
  "group": "boxes",
  "viewBox": "0 0 432.0 222.0",
  "w": 432.0,
  "h": 222.0,
  "d": "M111 216 L95 215 L79 211 L63 205 L56 200 L43 191 L31 179 L22 166 L14 151 L9 136 L6 119 L6 103 L9 86 L17 63 L26 49 L37 37 L49 26 L63 17 L79 11 L103 6 L321 6 L337 7 L353 11 L369 17 L376 22 L389 31 L401 43 L410 56 L418 71 L423 86 L426 103 L426 119 L423 136 L415 159 L406 173 L395 185 L383 196 L369 205 L353 211 L329 216 Z",
  "fill": "#8DB36B",
  "ink": "#0C0C0C",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   14.1,
   16.9,
   14.1,
   16.9
  ]
 },
 "ticket": {
  "label": "The Ticket",
  "group": "boxes",
  "viewBox": "0 0 432 222",
  "w": 432,
  "h": 222,
  "d": "M31 6 L401 6 L426 31 L426 77 L416 79 L404 86 L395 97 L393 108 L393 114 L394 121 L401 134 L412 142 L419 144 L426 145 L426 191 L401 216 L31 216 L6 191 L6 145 L16 143 L28 136 L37 125 L39 114 L39 108 L38 101 L31 88 L20 80 L13 78 L6 77 L6 31 Z",
  "fill": "#FBF4E4",
  "ink": "#0C0C0C",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   14.1,
   15.0,
   14.1,
   15.0
  ]
 },
 "scallop": {
  "label": "The Cake Box",
  "group": "boxes",
  "viewBox": "0 0 432.0 222.0",
  "w": 432.0,
  "h": 222.0,
  "d": "M6 216 L6 33 L6 29 L10 21 L16 14 L20 11 L30 7 L41 6 L52 7 L62 11 L69 17 L74 25 L76 33 L76 29 L80 21 L86 14 L90 11 L106 6 L116 6 L127 9 L136 14 L142 21 L146 29 L146 33 L146 29 L150 21 L156 14 L160 11 L176 6 L186 6 L197 9 L206 14 L212 21 L216 29 L216 33 L216 29 L220 21 L226 14 L235 9 L246 6 L256 6 L272 11 L276 14 L282 21 L286 29 L286 33 L286 29 L290 21 L296 14 L305 9 L316 6 L326 6 L342 11 L346 14 L352 21 L356 29 L356 33 L358 25 L363 17 L370 11 L380 7 L391 6 L402 7 L412 11 L416 14 L422 21 L426 29 L426 33 L426 216 Z",
  "fill": "#D7EACD",
  "ink": "#0C0C0C",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   23.5,
   11.1,
   12.2,
   11.1
  ]
 },
 "pricetag": {
  "label": "The Price Tag",
  "group": "boxes",
  "viewBox": "0 0 432.0 222.0",
  "w": 432.0,
  "h": 222.0,
  "d": "M94 6 L408 6 L416 8 L423 13 L425 18 L426 24 L426 198 L425 204 L421 211 L414 215 L408 216 L94 216 L6 111 Z",
  "fill": "#6E1F35",
  "ink": "#FBF4E4",
  "rotate": 0,
  "behind": "",
  "front": "<circle cx=\"42\" cy=\"111.0\" r=\"12\" fill=\"#FBF4E4\" stroke=\"#0C0C0C\" stroke-width=\"4\" vector-effect=\"non-scaling-stroke\"/>",
  "inset": [
   14.1,
   9.2,
   14.1,
   22.8
  ]
 },
 "bubble": {
  "label": "The Bubble",
  "group": "boxes",
  "viewBox": "0 0 432.0 222.0",
  "w": 432.0,
  "h": 222.0,
  "d": "M6 69 L9 51 L13 39 L20 29 L29 20 L39 13 L57 7 L69 6 L369 6 L381 9 L398 17 L412 29 L419 39 L423 51 L426 63 L426 126 L421 144 L412 159 L398 172 L381 180 L363 182 L138 182 L92 216 L98 182 L63 182 L45 178 L29 168 L20 159 L13 149 L9 138 L6 126 Z",
  "fill": "#F6CFD8",
  "ink": "#0C0C0C",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   10.3,
   11.1,
   23.5,
   11.1
  ]
 },
 "folder": {
  "label": "The Folder",
  "group": "boxes",
  "viewBox": "0 0 432.0 222.0",
  "w": 432.0,
  "h": 222.0,
  "d": "M6 200 L6 22 L9 13 L16 7 L22 6 L156 6 L192 40 L410 40 L419 42 L423 47 L426 52 L426 200 L423 209 L416 215 L410 216 L22 216 L16 215 L11 211 L7 206 Z",
  "fill": "#FBF4E4",
  "ink": "#0C0C0C",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   25.4,
   11.1,
   12.2,
   11.1
  ]
 },
 "stamp": {
  "label": "The Stamp",
  "group": "boxes",
  "viewBox": "0 0 432.0 222",
  "w": 432.0,
  "h": 222,
  "d": "M6 6 L10 6 L13 12 L19 15 L26 12 L28 6 L36 6 L39 12 L45 15 L52 12 L54 6 L63 6 L65 12 L72 15 L78 12 L81 6 L89 6 L92 12 L98 15 L104 12 L107 6 L115 6 L118 12 L124 15 L130 12 L133 6 L141 6 L144 12 L150 15 L157 12 L159 6 L168 6 L170 12 L177 15 L183 12 L186 6 L194 6 L196 12 L203 15 L209 12 L212 6 L220 6 L223 12 L229 15 L236 12 L238 6 L246 6 L249 12 L255 15 L262 12 L264 6 L273 6 L275 12 L282 15 L288 12 L291 6 L299 6 L302 12 L308 15 L314 12 L317 6 L325 6 L328 12 L334 15 L340 12 L343 6 L351 6 L354 12 L360 15 L367 12 L369 6 L378 6 L380 12 L387 15 L393 12 L396 6 L404 6 L406 12 L413 15 L419 12 L422 6 L426 6 L426 10 L420 13 L417 19 L420 26 L426 28 L426 36 L420 39 L417 45 L420 52 L426 54 L426 63 L420 65 L417 72 L420 78 L426 81 L426 89 L420 92 L417 98 L420 104 L426 107 L426 115 L420 118 L417 124 L420 130 L426 133 L426 141 L420 144 L417 150 L420 157 L426 159 L426 168 L420 170 L417 177 L420 183 L426 186 L426 194 L420 196 L417 203 L420 209 L426 212 L426 216 L422 216 L419 210 L413 207 L406 210 L404 216 L396 216 L393 210 L387 207 L380 210 L378 216 L369 216 L367 210 L360 207 L354 210 L351 216 L343 216 L340 210 L334 207 L328 210 L325 216 L317 216 L314 210 L308 207 L302 210 L299 216 L291 216 L288 210 L282 207 L275 210 L273 216 L264 216 L262 210 L255 207 L249 210 L246 216 L238 216 L236 210 L229 207 L223 210 L220 216 L212 216 L209 210 L203 207 L196 210 L194 216 L186 216 L183 210 L177 207 L170 210 L168 216 L159 216 L157 210 L150 207 L144 210 L141 216 L133 216 L130 210 L124 207 L118 210 L115 216 L107 216 L104 210 L98 207 L92 210 L89 216 L81 216 L78 210 L72 207 L65 210 L63 216 L54 216 L52 210 L45 207 L39 210 L36 216 L28 216 L26 210 L19 207 L13 210 L10 216 L6 216 L6 212 L12 209 L15 203 L12 196 L6 194 L6 186 L12 183 L15 177 L12 170 L6 168 L6 159 L12 157 L15 150 L12 144 L6 141 L6 133 L12 130 L15 124 L12 118 L6 115 L6 107 L12 104 L15 98 L12 92 L6 89 L6 81 L12 78 L15 72 L12 65 L6 63 L6 54 L12 52 L15 45 L12 39 L6 36 L6 28 L12 26 L15 19 L12 13 L6 10 Z",
  "fill": "#8DB36B",
  "ink": "#0C0C0C",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   15.9,
   13.1,
   15.9,
   13.1
  ]
 },
 "label": {
  "label": "The Label",
  "group": "boxes",
  "viewBox": "0 0 432 222",
  "w": 432,
  "h": 222,
  "d": "M65 6 L367 6 L426 65 L426 157 L367 216 L65 216 L6 157 L6 65 Z",
  "fill": "#4F6E3A",
  "ink": "#FBF4E4",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   14.1,
   15.0,
   14.1,
   15.0
  ]
 },
 "daisy": {
  "label": "The Daisy",
  "group": "stickers",
  "viewBox": "0 0 452.0 237.7",
  "w": 452.0,
  "h": 237.7,
  "d": "M446 119 L444 126 L440 133 L432 138 L421 142 L427 147 L430 154 L429 161 L425 168 L415 176 L406 180 L393 183 L382 184 L384 188 L382 194 L377 200 L370 205 L358 211 L340 214 L328 215 L312 213 L311 216 L308 220 L298 225 L281 230 L264 232 L241 229 L231 226 L226 222 L221 226 L207 230 L192 232 L175 231 L160 228 L151 224 L142 218 L140 213 L124 215 L112 214 L99 212 L86 208 L76 201 L71 196 L69 190 L69 187 L70 184 L59 183 L46 180 L37 176 L27 168 L23 161 L22 154 L25 147 L31 142 L20 138 L12 133 L8 126 L6 119 L8 112 L12 105 L20 100 L31 95 L25 91 L22 83 L23 77 L27 69 L37 62 L46 58 L59 54 L70 54 L68 50 L70 44 L75 37 L82 32 L94 27 L112 23 L124 23 L140 24 L141 21 L144 18 L154 13 L171 8 L188 6 L211 8 L221 11 L226 15 L231 11 L245 8 L260 6 L277 7 L292 10 L301 14 L310 20 L312 24 L324 23 L338 23 L352 25 L363 29 L372 34 L380 41 L383 47 L383 51 L382 54 L393 54 L406 58 L415 62 L425 69 L429 77 L430 83 L427 91 L421 95 L432 100 L440 105 L444 112 Z",
  "fill": "#FFE278",
  "ink": "#0C0C0C",
  "rotate": -4,
  "behind": "",
  "front": "",
  "inset": [
   19.0,
   16.9,
   19.0,
   16.9
  ]
 },
 "starburst": {
  "label": "The Starburst",
  "group": "stickers",
  "viewBox": "0 0 462.0 246.0",
  "w": 462.0,
  "h": 246.0,
  "d": "M456 123 L420 146 L434 175 L382 187 L371 217 L315 216 L281 240 L231 226 L181 240 L147 216 L91 217 L80 187 L28 175 L42 146 L6 123 L42 100 L28 71 L80 59 L91 29 L147 30 L181 6 L231 20 L281 6 L315 30 L371 29 L382 59 L434 71 L420 100 Z",
  "fill": "#F2B705",
  "ink": "#0C0C0C",
  "rotate": 5,
  "behind": "",
  "front": "",
  "inset": [
   22.7,
   20.8,
   22.7,
   20.8
  ]
 },
 "cloud": {
  "label": "The Cloud",
  "group": "stickers",
  "viewBox": "0 0 459.2 330.9",
  "w": 459.2,
  "h": 330.9,
  "d": "M446 170 L451 182 L453 196 L453 209 L450 221 L446 232 L439 242 L431 251 L420 259 L408 265 L396 268 L382 269 L369 267 L367 268 L357 285 L344 297 L328 308 L310 314 L292 317 L273 315 L256 310 L240 301 L227 310 L214 317 L197 323 L181 325 L164 324 L151 321 L141 317 L128 310 L118 302 L109 293 L102 283 L96 272 L74 273 L59 271 L42 264 L30 255 L22 246 L15 236 L11 227 L8 215 L6 201 L6 192 L9 180 L13 170 L13 166 L9 155 L6 141 L6 131 L7 117 L10 105 L17 90 L24 79 L33 70 L49 57 L67 50 L87 46 L104 47 L111 39 L124 27 L145 15 L164 8 L184 6 L202 7 L218 11 L234 17 L250 27 L261 23 L274 20 L285 18 L298 19 L311 21 L322 24 L342 34 L350 40 L360 50 L375 70 L392 72 L409 78 L423 88 L434 100 L443 115 L448 130 L449 145 L448 157 L445 166 Z",
  "fill": "#F6CFD8",
  "ink": "#0C0C0C",
  "rotate": -2,
  "behind": "",
  "front": "",
  "inset": [
   35.3,
   18.2,
   30.3,
   18.2
  ]
 },
 "polaroid": {
  "label": "The Polaroid",
  "group": "stickers",
  "viewBox": "0 0 412 256",
  "w": 412,
  "h": 256,
  "d": "M6 20 L406 20 L406 250 L6 250 Z",
  "fill": "#FFFFFF",
  "ink": "#0C0C0C",
  "rotate": -5,
  "behind": "",
  "front": "<rect x=\"22\" y=\"36\" width=\"368\" height=\"154\" fill=\"#D7EACD\" stroke=\"#0C0C0C\" stroke-width=\"3\" vector-effect=\"non-scaling-stroke\"/><g transform=\"rotate(4 206.0 22.0)\"><rect x=\"136.0\" y=\"6\" width=\"140\" height=\"32\" fill=\"#FFE278\" opacity=\"0.92\"/><rect x=\"136.0\" y=\"6\" width=\"140\" height=\"32\" fill=\"url(#shougCheck)\" opacity=\"0.55\"/></g>",
  "inset": [
   16.8,
   9.2,
   29.3,
   9.2
  ]
 },
 "ribbon": {
  "label": "The Ribbon",
  "group": "stickers",
  "viewBox": "0 0 472 182",
  "w": 472,
  "h": 182,
  "d": "M6 6 L466 6 L425 91 L466 176 L6 176 L47 91 Z",
  "fill": "#6E1F35",
  "ink": "#FBF4E4",
  "rotate": 0,
  "behind": "",
  "front": "",
  "inset": [
   14.5,
   14.9,
   14.5,
   14.9
  ]
 },
 "blob": {
  "label": "The Blob",
  "group": "stickers",
  "viewBox": "0 0 432.6 226.8",
  "w": 432.6,
  "h": 226.8,
  "d": "M422 115 L426 125 L427 133 L426 141 L422 149 L416 158 L410 164 L400 171 L388 178 L375 183 L351 191 L282 210 L239 218 L202 221 L185 221 L160 219 L118 211 L75 199 L54 190 L40 183 L28 175 L20 168 L13 160 L8 151 L6 142 L6 133 L9 124 L13 115 L52 54 L63 41 L76 31 L91 22 L116 14 L143 9 L182 6 L226 7 L266 12 L302 20 L330 30 L351 42 L374 61 L409 97 L417 107 Z",
  "fill": "#8DB36B",
  "ink": "#0C0C0C",
  "rotate": 3,
  "behind": "",
  "front": "",
  "inset": [
   18.4,
   14.6,
   16.7,
   12.2
  ]
 },
 "matchacup": {
  "label": "The Matcha Cup",
  "group": "stickers",
  "viewBox": "0 0 452.8 292.0",
  "w": 452.8,
  "h": 292.0,
  "d": "M6 66 L367 66 L322 269 L316 279 L310 283 L303 286 L74 286 L67 285 L60 281 L55 276 L51 269 Z",
  "fill": "#D7EACD",
  "ink": "#0C0C0C",
  "rotate": 0,
  "behind": "<rect x=\"222.5\" y=\"6\" width=\"22\" height=\"90\" rx=\"4\" fill=\"#F6CFD8\" stroke=\"#0C0C0C\" stroke-width=\"3\" vector-effect=\"non-scaling-stroke\"/><rect x=\"336.8\" y=\"114.4\" width=\"110\" height=\"110\" rx=\"49.5\" fill=\"#D7EACD\" stroke=\"#0C0C0C\" stroke-width=\"3\" vector-effect=\"non-scaling-stroke\"/><rect x=\"376.8\" y=\"146.4\" width=\"38\" height=\"46\" rx=\"16\" fill=\"#FBF4E4\" stroke=\"#0C0C0C\" stroke-width=\"3\" vector-effect=\"non-scaling-stroke\"/>",
  "front": "<line x1=\"12\" y1=\"112\" x2=\"358.8\" y2=\"112\" stroke=\"#0C0C0C\" stroke-width=\"4\" vector-effect=\"non-scaling-stroke\"/><rect x=\"46\" y=\"80\" width=\"44\" height=\"26\" rx=\"6\" fill=\"#FFFFFF\" stroke=\"#0C0C0C\" stroke-width=\"3\" vector-effect=\"non-scaling-stroke\"/><rect x=\"274.8\" y=\"76\" width=\"44\" height=\"26\" rx=\"6\" fill=\"#FFFFFF\" stroke=\"#0C0C0C\" stroke-width=\"3\" vector-effect=\"non-scaling-stroke\"/>",
  "inset": [
   42.2,
   22.9,
   11.1,
   5.2
  ]
 },
 "journal": {
  "label": "The Journal",
  "group": "stickers",
  "viewBox": "0 0 432 232.0",
  "w": 432,
  "h": 232.0,
  "d": "M6 6 L426 6 L422 14 L420 23 L417 31 L421 40 L420 57 L424 65 L421 74 L418 91 L425 99 L423 108 L425 116 L418 124 L419 133 L426 141 L416 150 L416 158 L420 167 L420 175 L424 184 L426 192 L421 201 L425 209 L424 218 L426 226 L6 226 Z",
  "fill": "#FBF4E4",
  "ink": "#0C0C0C",
  "rotate": 2,
  "behind": "",
  "front": "<line x1=\"56\" y1=\"42.7\" x2=\"412\" y2=\"42.7\" stroke=\"#BED6B0\" stroke-width=\"2\" vector-effect=\"non-scaling-stroke\"/><line x1=\"56\" y1=\"79.3\" x2=\"412\" y2=\"79.3\" stroke=\"#BED6B0\" stroke-width=\"2\" vector-effect=\"non-scaling-stroke\"/><line x1=\"56\" y1=\"116.0\" x2=\"412\" y2=\"116.0\" stroke=\"#BED6B0\" stroke-width=\"2\" vector-effect=\"non-scaling-stroke\"/><line x1=\"56\" y1=\"152.7\" x2=\"412\" y2=\"152.7\" stroke=\"#BED6B0\" stroke-width=\"2\" vector-effect=\"non-scaling-stroke\"/><line x1=\"56\" y1=\"189.3\" x2=\"412\" y2=\"189.3\" stroke=\"#BED6B0\" stroke-width=\"2\" vector-effect=\"non-scaling-stroke\"/><line x1=\"52\" y1=\"6\" x2=\"52\" y2=\"226\" stroke=\"#F6CFD8\" stroke-width=\"3\" vector-effect=\"non-scaling-stroke\"/><circle cx=\"29\" cy=\"34.0\" r=\"9\" fill=\"#FBF4E4\" stroke=\"#0C0C0C\" stroke-width=\"4\" vector-effect=\"non-scaling-stroke\"/><circle cx=\"29\" cy=\"75.0\" r=\"9\" fill=\"#FBF4E4\" stroke=\"#0C0C0C\" stroke-width=\"4\" vector-effect=\"non-scaling-stroke\"/><circle cx=\"29\" cy=\"116.0\" r=\"9\" fill=\"#FBF4E4\" stroke=\"#0C0C0C\" stroke-width=\"4\" vector-effect=\"non-scaling-stroke\"/><circle cx=\"29\" cy=\"157.0\" r=\"9\" fill=\"#FBF4E4\" stroke=\"#0C0C0C\" stroke-width=\"4\" vector-effect=\"non-scaling-stroke\"/><circle cx=\"29\" cy=\"198.0\" r=\"9\" fill=\"#FBF4E4\" stroke=\"#0C0C0C\" stroke-width=\"4\" vector-effect=\"non-scaling-stroke\"/>",
  "inset": [
   14.0,
   9.2,
   14.0,
   16.9
  ]
 },
 "peel": {
  "label": "The Peel",
  "group": "stickers",
  "viewBox": "0 0 432.0 222.0",
  "w": 432.0,
  "h": 222.0,
  "d": "M6 32 L9 20 L14 14 L20 9 L32 6 L400 6 L412 9 L421 17 L425 24 L426 32 L426 149 L359 216 L32 216 L20 213 L11 205 L6 194 Z",
  "fill": "#F6CFD8",
  "ink": "#0C0C0C",
  "rotate": -3,
  "behind": "",
  "front": "<polygon points=\"426.0,148.8 358.8,216.0 352.8,142.8\" fill=\"#F2B705\" stroke=\"#0C0C0C\" stroke-width=\"3\" stroke-linejoin=\"round\" vector-effect=\"non-scaling-stroke\"/>",
  "inset": [
   14.1,
   15.0,
   21.6,
   11.1
  ]
 }
};

export const NARRATION_SHAPE = "toast";
export const CONTINUE_SHAPE = "pill";
export const CHOICE_SHAPES = [
  "ticket", "scallop", "pricetag", "bubble", "folder", "stamp", "label",
  "daisy", "starburst", "cloud", "polaroid", "ribbon", "blob", "matchacup", "journal", "peel",
];

/** Stable shape per node + choice index, so it never changes on reload. */
export function pickChoiceShape(nodeId = "", index = 0) {
  let h = 0;
  const str = String(nodeId);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return CHOICE_SHAPES[(h + index * 7) % CHOICE_SHAPES.length];
}

export function ShougShape({
  shape = "toast",
  as: Tag = "div",
  fill,
  ink,
  rotate,
  shadow = 7,
  stroke = 3,
  className = "",
  style = {},
  children,
  ...rest
}) {
  const s = SHOUG_SHAPES[shape] || SHOUG_SHAPES.toast;
  const [t, r, b, l] = s.inset;
  const rot = rotate ?? s.rotate;
  return (
    <Tag
      className={`shoug-shape shoug-shape--${shape} ${className}`}
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        aspectRatio: `${s.w} / ${s.h}`,
        transform: rot ? `rotate(${rot}deg)` : undefined,
        background: "none",
        border: 0,
        padding: 0,
        color: ink || s.ink,
        cursor: Tag === "button" ? "pointer" : undefined,
        ...style,
      }}
      {...rest}
    >
      <svg
        viewBox={s.viewBox}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible",
          filter: `drop-shadow(${shadow}px ${shadow}px 0 ${SHOUG_COLORS.black})`,
        }}
      >
        <defs>
          <pattern id="shougCheck" width="10" height="10" patternUnits="userSpaceOnUse">
            <rect width="5" height="5" fill="#fff" /><rect x="5" y="5" width="5" height="5" fill="#fff" />
          </pattern>
        </defs>
        <g dangerouslySetInnerHTML={{ __html: s.behind }} />
        <path
          d={s.d}
          fill={fill || s.fill}
          stroke={SHOUG_COLORS.black}
          strokeWidth={stroke}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <g dangerouslySetInnerHTML={{ __html: s.front }} />
      </svg>
      <span
        className="shoug-shape__content"
        style={{
          position: "absolute",
          top: `${t}%`, right: `${r}%`, bottom: `${b}%`, left: `${l}%`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          textAlign: "center",
        }}
      >
        {children}
      </span>
    </Tag>
  );
}

export default ShougShape;
