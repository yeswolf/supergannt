# Real MPP fixtures for integration tests

These are **real Microsoft Project plans**, not synthetic stubs.

| File | Origin |
|------|--------|
| `01-advanced-tasks.mpp` … `09-consolidating.mpp` | Practice files from **Microsoft Project 2013 Step by Step** (O'Reilly / Microsoft Press), ISBN `9780735669116`. Downloaded from [O'Reilly examples](https://resources.oreilly.com/examples/9780735669116-files). |
| `10-project-online-sample.mpp` | Real **Project Online** export attached to [MPXJ issue #443](https://github.com/joniles/mpxj/issues/443) (`Sample.mpp.zip`). |

`SOURCES.json` mirrors this table for automated checks.

## Re-fetch

```bash
node scripts/fetch-mpp-fixtures.mjs
```

Copyright remains with the original publishers; files are used here only as test fixtures for open/schedule interoperability.
