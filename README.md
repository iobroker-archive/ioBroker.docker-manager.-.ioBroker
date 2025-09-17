![Logo](admin/matter.svg)

# ioBroker Docker manager Adapter

![Number of Installations](http://iobroker.live/badges/matter-installed.svg)
![Number of Installations](http://iobroker.live/badges/matter-stable.svg)
[![NPM version](http://img.shields.io/npm/v/iobroker.matter.svg)](https://www.npmjs.com/package/iobroker.matter)

![Test and Release](https://github.com/ioBroker/ioBroker.matter/workflows/Test%20and%20Release/badge.svg)
[![Translation status](https://weblate.iobroker.net/widgets/adapters/-/matter/svg-badge.svg)](https://weblate.iobroker.net/engage/adapters/?utm_source=widget)
[![Downloads](https://img.shields.io/npm/dm/iobroker.matter.svg)](https://www.npmjs.com/package/iobroker.matter)

**This adapter uses Sentry libraries to automatically report exceptions and code errors to the developers.**
For more details and for information how to disable the error reporting, see [Sentry-Plugin Documentation](https://github.com/ioBroker/plugin-sentry#plugin-sentry)!
Sentry reporting is used starting with js-controller 3.0.

## Introduction

This adapter is a graphical user interface for managing Docker containers.
It allows you to easily create, start, stop, and delete Docker containers directly from the ioBroker admin interface.

The adapter provides a user-friendly way to manage your Docker environment without needing to use command-line tools.

### Explanation of the docker image and container

Docker is an open-source platform for automating the deployment, scaling, and management of applications in containers.
Containers are lightweight, isolated environments that include all necessary components such as code, runtime, libraries, and configurations to run an application.
With Docker, developers can deliver applications consistently and portably, regardless of the underlying infrastructure.
This facilitates team collaboration, simplifies running applications on different systems, and improves scalability.

A Docker image is a lightweight, standalone, and executable software package that includes everything needed to run a piece of software, including the code, runtime, libraries, environment variables, and configuration files.
Think of it as a snapshot of an application and its dependencies at a specific point in time.
In ioBroker notation, it is like an adapter.

A Docker container, on the other hand, is a runtime instance of a Docker image. It is a lightweight, isolated environment that runs the application defined by the Docker image.
When you run a Docker image, it creates a container that encapsulates the application and its dependencies, allowing it to run consistently across different environments.
In ioBroker notation, it is like an instance of an adapter.

## Prerequisites

- You need to have Docker installed and running on your system.
- The user running the ioBroker process must have permission to access the Docker daemon. This is typically done by adding the user to the `docker` group. Or just call `iob fix` to set the permissions.

## How to install docker

- For installation instructions, please refer to the official Docker documentation: https://docs.docker.com/get-docker/
- After installing Docker, ensure that the Docker service is running. You can check the status of the Docker service using the following command:
    - On Linux: `systemctl status docker`
    - On Windows and macOS, Docker Desktop should be running.

<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->

## Changelog
### 0.0.3 (2025-09-17)

- (@GermanBluefox) Initial commit

## License

The MIT License (MIT)

Copyright (c) 2025 bluefox <dogafox@gmail.com>
