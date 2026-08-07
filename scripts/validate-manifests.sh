#!/usr/bin/env bash
set -euo pipefail

ruby -e '
  require "yaml"
  ARGV.each do |path|
    documents = YAML.load_stream(File.read(path))
    raise "#{path}: no YAML documents" if documents.compact.empty?
    documents.compact.each do |document|
      raise "#{path}: document is not a map" unless document.is_a?(Hash)
      raise "#{path}: missing apiVersion" unless document["apiVersion"]
      raise "#{path}: missing kind" unless document["kind"]
    end
  end
' labs/p5-nccl-efa/manifests/*.yaml

echo "Validated Kubernetes YAML documents."
