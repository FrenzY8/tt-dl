export function success(data, message = "Success") {
    return { success: true, message, data };
}

export function fail(message = "Request failed") {
    return { success: false, message };
}