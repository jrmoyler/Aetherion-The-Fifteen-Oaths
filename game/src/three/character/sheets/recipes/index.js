// Sheet recipes by hero id. A hero without a recipe keeps its baked costume.
import oath01Ninja from './oath-01-ninja.js';
import oath01Sorcerer from './oath-01-sorcerer.js';
import oath02Ninja from './oath-02-ninja.js';
import oath02Sorcerer from './oath-02-sorcerer.js';
import oath03Ninja from './oath-03-ninja.js';
import oath03Sorcerer from './oath-03-sorcerer.js';
import oath04Ninja from './oath-04-ninja.js';
import oath04Sorcerer from './oath-04-sorcerer.js';
import oath05Ninja from './oath-05-ninja.js';
import oath05Sorcerer from './oath-05-sorcerer.js';
import oath06Ninja from './oath-06-ninja.js';
import oath06Sorcerer from './oath-06-sorcerer.js';
import oath07Ninja from './oath-07-ninja.js';
import oath07Sorcerer from './oath-07-sorcerer.js';
import oath08Ninja from './oath-08-ninja.js';
import oath08Sorcerer from './oath-08-sorcerer.js';
import oath09Ninja from './oath-09-ninja.js';
import oath09Sorcerer from './oath-09-sorcerer.js';
import oath10Ninja from './oath-10-ninja.js';
import oath10Sorcerer from './oath-10-sorcerer.js';
import oath11Ninja from './oath-11-ninja.js';
import oath11Sorcerer from './oath-11-sorcerer.js';
import oath12Ninja from './oath-12-ninja.js';
import oath12Sorcerer from './oath-12-sorcerer.js';
import oath13Ninja from './oath-13-ninja.js';
import oath13Sorcerer from './oath-13-sorcerer.js';
import oath14Ninja from './oath-14-ninja.js';
import oath14Sorcerer from './oath-14-sorcerer.js';
import oath15Ninja from './oath-15-ninja.js';
import oath15Sorcerer from './oath-15-sorcerer.js';

export const RECIPES = Object.fromEntries([
  oath01Ninja, oath01Sorcerer, oath02Ninja, oath02Sorcerer, oath03Ninja, oath03Sorcerer,
  oath04Ninja, oath04Sorcerer, oath05Ninja, oath05Sorcerer, oath06Ninja, oath06Sorcerer,
  oath07Ninja, oath07Sorcerer, oath08Ninja, oath08Sorcerer, oath09Ninja, oath09Sorcerer,
  oath10Ninja, oath10Sorcerer, oath11Ninja, oath11Sorcerer, oath12Ninja, oath12Sorcerer,
  oath13Ninja, oath13Sorcerer, oath14Ninja, oath14Sorcerer, oath15Ninja, oath15Sorcerer,
].map((recipe) => [recipe.id, recipe]));
export const recipeFor = (id) => RECIPES[id] ?? null;
