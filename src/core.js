const IN = 25.4;
const DC = /*MAPS*/{}/*END*/;   // layouts from 40kdc-data (CC BY 4.0), see credits in the Save tab
const CAT = /*UNITS*/{"factions":[],"units":[]}/*ENDUNITS*/;   // unit names, model counts and base sizes from 40kdc-data
const ROUNDS = [25, 28.5, 32, 40, 50, 60, 80, 90, 100, 130, 160];
const OVALS = [[60,35],[75,42],[90,52],[105,70],[120,92],[170,109]];
const COLOURS = ['#a8348f','#4c8a2a','#b3261e','#2c5f8a','#d1a51c','#d9d2bd','#2a2d2c'];
const STORE = 'tabletop-base-planner-v4';
const $ = id => document.getElementById(id);

export { IN, DC, CAT, ROUNDS, OVALS, COLOURS, STORE, $ };
