import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { AppError } from "../../server/core/errors/app-error"
import {
  parseOptionalDaysField,
  parseRequiredDaysField,
} from "../../server/core/utils/timeline-write-validation"

describe("timeline-write-validation days/date", () => {
  it("normalizes, deduplicates and sorts required days", () => {
    const source = {
      days: ["2026-05-14", " 2026-05-12 ", "2026-05-14", "2026-05-13"],
    }

    const result = parseRequiredDaysField(source)
    assert.deepEqual(result, ["2026-05-12", "2026-05-13", "2026-05-14"])
  })

  it("returns undefined for absent optional days", () => {
    const result = parseOptionalDaysField({})
    assert.equal(result, undefined)
  })

  it("throws VALIDATION_ERROR for empty days array", () => {
    assert.throws(
      () => parseRequiredDaysField({ days: [] }),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.status, 400)
        assert.equal(error.code, "VALIDATION_ERROR")
        assert.match(error.message, /at least one date/)
        return true
      },
    )
  })

  it("throws VALIDATION_ERROR for non-string day entry", () => {
    assert.throws(
      () => parseRequiredDaysField({ days: ["2026-05-12", 42] }),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.status, 400)
        assert.equal(error.code, "VALIDATION_ERROR")
        assert.match(error.message, /only strings/)
        return true
      },
    )
  })

  it("throws VALIDATION_ERROR for invalid date format", () => {
    assert.throws(
      () => parseRequiredDaysField({ days: ["2026/05/12"] }),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.status, 400)
        assert.equal(error.code, "VALIDATION_ERROR")
        assert.match(error.message, /YYYY-MM-DD/)
        return true
      },
    )
  })

  it("throws VALIDATION_ERROR for impossible ISO date", () => {
    assert.throws(
      () => parseRequiredDaysField({ days: ["2026-02-30"] }),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.status, 400)
        assert.equal(error.code, "VALIDATION_ERROR")
        assert.match(error.message, /YYYY-MM-DD/)
        return true
      },
    )
  })
})
