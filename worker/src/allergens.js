// The allergen list (Health Canada / CFIA priority allergens plus gluten sources; docs/ALLERGENS.md) and conflicts. Pure.
import { listWords } from './text.js'

export const ALLERGENS = [
  { key: 'eggs', label: 'Eggs' },
  { key: 'milk', label: 'Milk' },
  { key: 'mustard', label: 'Mustard' },
  { key: 'peanuts', label: 'Peanuts' },
  { key: 'crustaceans_molluscs', label: 'Crustaceans and molluscs' },
  { key: 'fish', label: 'Fish' },
  { key: 'sesame', label: 'Sesame seeds' },
  { key: 'soy', label: 'Soy' },
  { key: 'sulphites', label: 'Sulphites' },
  { key: 'tree_nuts', label: 'Tree nuts' },
  { key: 'wheat_triticale', label: 'Wheat and triticale' },
  { key: 'gluten', label: 'Gluten (barley, oats, rye, triticale, wheat)' },
]
export const ALLERGEN_KEYS = ALLERGENS.map((a) => a.key)
const LABELS = Object.fromEntries(ALLERGENS.map((a) => [a.key, a.label]))

export const allergenLabel = (key) => LABELS[key] || key

/** "Milk", "Milk and Mustard", "Eggs, Milk and Mustard" */
export const allergenWords = (keys) => listWords(keys.map(allergenLabel))

/** Unique known keys, in list order; null when the value is not a list of unique known keys. */
export function cleanAllergenList(value) {
  if (!Array.isArray(value)) return null
  if (value.some((k) => typeof k !== 'string' || !LABELS[k])) return null
  if (new Set(value).size !== value.length) return null
  return ALLERGEN_KEYS.filter((k) => value.includes(k))
}

/** The item's allergens that are in this child's allergies, in list order. Only that child's own allergies count. */
export const conflicts = (itemAllergens, childAllergies) =>
  ALLERGEN_KEYS.filter((k) => itemAllergens.includes(k) && childAllergies.includes(k))

/** Every current conflict was acknowledged when the line was placed. */
export const acknowledged = (current, ackAllergens) => current.every((k) => ackAllergens.includes(k))

/** "conflict" | "allergy" | null for a child on a day. */
export function flagOf(childAllergies, lineConflicts) {
  if (lineConflicts.some((c) => c.length)) return 'conflict'
  return childAllergies.length ? 'allergy' : null
}
