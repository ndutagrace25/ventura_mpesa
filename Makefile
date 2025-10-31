SHELL:=/bin/bash
IMAGE_NAME:=mpesa-new:dev
DOCKER_STOP!=$(docker stop $(docker ps -a -q --filter ancestor=$(IMAGE_NAME) --format="{{.ID}}"))

build:
	@docker build --no-cache -t mpesa-new:dev .

tag:
	@docker tag mpesa-new:dev gcr.io/powwater/mpesa-new-dev

push:
	@docker push gcr.io/powwater/mpesa-new-dev

## Run the image locally
run:
	@docker run -d -it -p 80:80 -t ${IMAGE_NAME}

#shortcut for build and the running the container
up: build run

down:
	@docker rm ${DOCKER_STOP}