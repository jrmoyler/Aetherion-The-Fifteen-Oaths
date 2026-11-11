// Sheet recipes by hero id. A hero without a recipe keeps its baked costume.
import kilnNinja from './oath-01-ninja.js';

export const RECIPES = Object.fromEntries([kilnNinja].map((recipe) => [recipe.id, recipe]));
export const recipeFor = (id) => RECIPES[id] ?? null;
