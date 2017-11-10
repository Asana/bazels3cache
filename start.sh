#!/usr/bin/env bash

read_info_yaml_property()
{
	property_name=$1
	sed -n -e 's/^'$property_name': \(.*\)$/\1/p' $CODEZ/info.yaml
}

if [[ -f $CODEZ/info.yaml ]]; then
	export AWS_ACCESS_KEY_ID=$(read_info_yaml_property aws_access_key_id)
	export AWS_SECRET_ACCESS_KEY=$(read_info_yaml_property aws_secret_access_key)
fi

DEBUG=* bin/webdav-s3
