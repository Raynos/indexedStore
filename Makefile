test: 
	tar -cf- index.js test.js test lib | curl -sSNT- \
		-u raynos2@gmail.com:$(TESTLING_PASSWORD) \
		-m 30 \
  		testling.com/?browsers=chrome/17.0\&noinstrument

minutes:
	curl -u raynos2@gmail.com:$(TESTLING_PASSWORD) -s \
  		testling.com/usage.json

browserify:
	browserify -o ./test/test.js test.js

run-test:
	/opt/google/chrome/google-chrome --enable-plugins ./test/index.html
  		
.PHONY: test minutes