let currentValue = 0

export function readValue() {
  return currentValue
}

export function bumpValue() {
  currentValue += 1
  return currentValue
}

export function resetValue() {
  currentValue = 0
  return currentValue
}
