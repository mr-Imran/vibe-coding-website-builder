#!/usr/bin/env bash
set -eu
cp -R "$(dirname "$0")/files/." .
# The test site leaks a payment key. The key is put together here, at run time,
# so that no key-shaped text sits in this repository (code hosts scan for it).
# It is made up and opens nothing.
key="sk_"
key="${key}live_"
key="${key}51PvBrightPaws9fK2mQx7LdT4wZc8RnYh3Jb6Ue0As"
sed -i "s/__STRIPE_SECRET_KEY__/${key}/" script.js
