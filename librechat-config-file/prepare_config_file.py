import yaml


def read_yaml_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        data = yaml.safe_load(file)
    return data

def read_md_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()
    return content


if __name__ == "__main__":
    yaml_file_path = "template_librechat.yaml"
    config = read_yaml_file(yaml_file_path)
    promp_test = read_md_file("prompt.md")
    modelSpecs_list = config['modelSpecs']['list']
    for spec in modelSpecs_list:
        spec['preset']['promptPrefix'] = promp_test

    # Save the modified config to a new YAML file
    output_file_path = "librechat.yaml"
    with open(output_file_path, 'w', encoding='utf-8') as file:
        yaml.dump(config, file, default_flow_style=False, allow_unicode=True, sort_keys=False)