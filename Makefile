## TESTS

TESTER = ./node_modules/.bin/mocha
OPTS = -G
TESTS = test/imported.test.js

test:
	$(TESTER) $(OPTS) $(TESTS)
test-verbose:
	$(TESTER) $(OPTS) --reporter spec $(TESTS)
testing:
	$(TESTER) $(OPTS) --watch $(TESTS)

.PHONY: test docs
