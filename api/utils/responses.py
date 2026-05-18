#   POSSIBLE CODES
#CONFLICT
#NOT_FOUND
#INSUFFICIENT_PERMISSION
#ORGANIZATION_ACCESS_DENIED
#

def success(data=None, message=None, status=200):
    response= {}
    if message:
        response["message"] = message
    
    if data:
        response["data"] = data
    return response, status

def error(code, message, status=400):
    return {
        "error": {
            "code": code,
            "message": message
        }
    }, status