pogo_files := $(filter-out qo.pogo, $(wildcard *.pogo))
files := $(pogo_files:.pogo=.js)

all: $(files)

$(files): $(pogo_files)
	pogo -cs $(pogo_files)

clean:
	rm $(files)
