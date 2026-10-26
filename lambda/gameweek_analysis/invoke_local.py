import json

from handler import handler

if __name__ == "__main__":
    response = handler({}, None)
    print(f"Status: {response['statusCode']}")
    print(json.dumps(json.loads(response["body"]), indent=2))
    if response["statusCode"] != 200:
        raise SystemExit(1)
